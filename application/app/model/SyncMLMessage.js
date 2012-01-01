//Class to generate and parse SyncML Messages.
//JSlint options:
/*jslint indent: 2 */
/*global DOMParser, log, window */

var syncMLMessage = function () {
  "use strict";
  //private members:
  var m = [], //will contain message elements
    header = { //will contain information about the header.
      encodedCredentials: undefined,  //credentials to authenticate user on the server.                  

      //response things:
      respURI: undefined,                 //server might return a response url that is to be used in following communication.
      msgId: undefined,               //response msgId, use to filter duplicates
      sessionId: undefined            //response sessionId, use to filter false packets.
    },
    body = { //will contain information about the body.
      alerts: [], //contains alerts. Should be mostly just one for sync initialization...
      status: {}, //contains status reports = aks/nacks of previous commands
      sync: [ { add: [], del: [], replace: [] } ],   //contains sync commands add/replace/delete
      map: [], //mapping used to map local ids to global ids for new items from server TODO: support dafür implementieren!
      putDevInfo: {}, //may transmit deviceInfo.
      isFinal: true //final needs to be specified in the last message of the "SyncML Package".. 
    },
    //helper to parse XML text messages.
    xmlParser = new DOMParser(),
    cmdId = 0; //necessary to start with Id 1. 

  //helper function to print a node content:
  function printNode(node) {
    var child, string;

    //catch nodes with values:
    if (node.nodeValue) {
      return node.nodeValue;
    }

    string = "<" + node.nodeName + ">\n";

    child = node.firstChild;
    while (child) {
      string += printNode(child);
      child = child.nextSibling;
    }

    string += "</" + node.nodeName + ">\n";

    return string;
  }

  //returns cmdId for a new command, starting with 1. 
  function getCmdId() {
    cmdId += 1;
    return cmdId;
  }

  //write a node with value: 
  function writeNodeValue(name, value, prefix, meta) {
    m.push(prefix + "<" + name + (meta ? " xmlns=\"syncml:metinf\"" : "") + ">" + value + "</" + name + ">\n");
  }

  //writes new cmd to message.
  function writeCmdId(command, prefix) {
    var cmdId = getCmdId();
    command.cmdId = cmdId;
    writeNodeValue("CmdID", cmdId, prefix);
  }

  function addCredentialsToHeader() {
    if (header.encodedCredentials) {
      m.push("\t\t<Cred>\n");
      m.push("\t\t\t<Meta>\n");
      writeNodeValue("Type", "syncml:auth-basic", "\t\t\t\t", true); //currently only supporting basic auth 
      writeNodeValue("Format", "b64", "\t\t\t\t", true);
      m.push("\t\t\t</Meta>\n");
      writeNodeValue("Data", header.encodedCredentials, "\t\t\t");
      m.push("\t\t</Cred>\n");
    }
  }

  function addTargetSource(info, prefix) {
    if (info.target) {
      m.push(prefix); m.push("<Target><LocURI>"); m.push(info.target); m.push("</LocURI></Target>\n");
    }
    if (info.source) {
      m.push(prefix); m.push("<Source><LocURI>"); m.push(info.source); m.push("</LocURI></Source>\n");
    }
  }

  function readTargetSource(node) {
    var child = node.firstChild;
    while (child) {
      log("Target/Source-child: " + child.nodeName);
      switch (child.nodeName) {
      case "LocURI":
        return child.firstChild.nodeValue;
      case "LocName":
        //ignore.
        break;
      }
    }
  }

  function readAnchor(node) {
    var child, anchor = {};
    child = node.firstChild;
    while (child) {
      log("Anchor-child: " + child.nodeName);
      switch (child.nodeName) {
      case "Last":
        anchor.last = child.firstChild.nodeValue;
        break;
      case "Next":
        anchor.next = child.firstChild.nodeValue;
        break;
      default:
        log("WARNING: readAnchor does not understand " + child.nodeName + ", yet. Value ignored. " + printNode(node));
        break;
      }
      child = child.nextSibling;
    }
    return anchor;
  }

  function readMeta(node) {
    var child, meta = {};
    child = node.firstChild;
    while (child) {
      log("meta-child: " + child.nodeName);
      switch (child.nodeName) {
      case "Anchor":
        meta.anchor = readAnchor(child);
        break;
      case "Format":
        meta.format = child.firstChild.nodeValue;
        break;
      case "Type":
        meta.type = child.firstChild.nodeValue;
        break;
      case "MaxMsgSize":
        meta.maxMsgSize = child.firstChild.nodeValue;
        break;
      default:
        log("WARNIG: readMeta does not understand " + child.nodeName + ", yet. Value ignored. " + printNode(node));
        break;
      }
      child = child.nextSibling;
    }

    return meta;
  }

  //helper function to parse header values into this message:
  function readHeader(hdr) {
    var header = {}, child;
    child = hdr.firstChild;
    while (child) {
      log("header-child: " + child.nodeName);
      switch (child.nodeName) {
      case "SessionID":
        header.sessionId = child.firstChild.nodeValue;
        break;
      case "MsgID":
        header.msgId = child.firstChild.nodeValue;
        break;
      case "RespURI":
        header.respURI = child.firstChild.nodeValue;
        break;
      case "Meta":
        header.meta = readMeta(child);
        break;
      case "VerDTD":
        if (child.firstChild.nodeValue !== "1.2") {
          log("WARNING: VerDTD not 1.2, but " + child.firstChild.nodeValue + ". Not sure what will happen...");
        }
        break;
      case "VerProto":
        if (child.firstChild.nodeValue !== "SyncML/1.2") {
          log("WARNING: VerProto not SyncML/1.2, but " + child.firstChild.nodeValue + ". Not sure what will happen...");
        }
        break;
      case "Target":
        header.target = readTargetSource(child);
        break;
      case "Source":
        header.source = readTargetSource(child);
        break;
      default:
        log("WARNING: readHeader does not understand " + child.nodeName + ", yet. Value ignored. " + printNode(hdr));
        break;
      }
      child = child.nextSibling;
    }
    return header;
  }

  //helper function to add meta to msg
  function addMetaToMsg(meta, prefix) {
    m.push(prefix); m.push("<Meta>\n");
    var nprefix = prefix + "\t";
    if (meta.anchor) {
      m.push(nprefix); m.push("<Anchor xmlns='syncml:metinf'>\n");
      if (meta.last) {
        writeNodeValue("Last", meta.anchor.last, nprefix + "\t", true);
      }
      writeNodeValue("Next", meta.anchor.next, nprefix + "\t", true);
      m.push(nprefix); m.push("</Anchor>\n");
    }
    if (meta.format) {
      writeNodeValue("Format", meta.format, nprefix, true);
    }
    if (meta.type) {
      writeNodeValue("Type", meta.type, nprefix, true);
    }
    if (meta.maxMsgSize) {
      writeNodeValue("MaxMsgSize", meta.maxMsgSize, nprefix, true);
    }
    m.push(prefix); m.push("</Meta>\n");
  }

  //helper function to parse items
  function readItem(node) {
    var child, item = {};

    //may have: Target, Source, Meta, Data. Not supported by me: SourceParent, TargetPartent :)
    child = node.firstChild;
    while (child) {
      log("item-child: " + child.nodeName);
      switch (child.nodeName) {
      case "Data":
        item.data = child.firstChild.nodeValue;
        break;
      case "Source":
        item.source = readTargetSource(child);
        break;
      case "Target":
        item.target = readTargetSource(child);
        break;
      case "Meta":
        item.meta = readMeta(child);
        break;
      default:
        log("Unexpected type (" + child.nodeName + ") in: " + printNode(child));
        break;
      }

      child = child.nextSibling;
    }

    return item;
  }

  //helper function to write item to msg
  function addItemToMsg(item, prefix) {
    m.push(prefix); m.push("<Item>\n");
    var nprefix = prefix + "\t";
    addTargetSource(item, nprefix);
    if (item.meta) {
      addMetaToMsg(item.meta, nprefix);
    }
    if (item.data) {
      writeNodeValue("Data", item.data, nprefix);
    }
    m.push(prefix); m.push("</Item>\n");
  }

  //helper function to parse alerts
  function readAlert(node) {
    var alert = {}, child;
    child = node.firstChild;
    while (child) {
      log("alert-child: " + child.nodeName);
      switch (child.nodeName) {
      case "CmdID":
        alert.cmdId = child.firstChild.nodeValue;
        break;
      case "Data":
        alert.data = child.firstChild.nodeValue;
        break;
      case "Item":
        if (!alert.items) {
          alert.items = [];
        }
        alert.items.push(readItem(child));
        break;
      default:
        log("WARNING: readAlert does not understand " + child.nodeName + ". Ignored. " + printNode(node));
        break;
      }

      child = child.nextSibling;
    }

    if (!alert.cmdId) {
      throw ({name: "SyntaxError", message: "Need cmdId for alert, none found: " + printNode(node)});
    }
    if (!alert.data) {
      throw ({name: "SyntaxError", message: "Need data for alert, none found: " + printNode(node)});
    }

    return alert;
  }

  //helper function to add alert to msg:
  function addAlertToMsg(alert, prefix) {
    var i, nprefix;
    m.push(prefix); m.push("<Alert>\n");
    nprefix = prefix + "\t";
    writeCmdId(alert, nprefix);
    if (alert.items) {
      for (i = 0; i < alert.items.length; i += 1) {
        addItemToMsg(alert.items[i], nprefix);
      }
    }
    writeNodeValue("Data", alert.data, nprefix);
    m.push(prefix); m.push("</Alert>\n");
  }

  //helper function to parse status
  function readStatus(node) {
    var status = { items: []}, child;
    child = node.firstChild;
    while (child) {
      log("status-child: " + child.nodeName);
      switch (child.nodeName) {
      case "CmdID":
        status.cmdId = child.firstChild.nodeValue;
        break;
      case "MsgRef":
        status.msgRef = child.firstChild.nodeValue;
        break;
      case "CmdRef":
        status.cmdRef = child.firstChild.nodeValue;
        break;
      case "Cmd":
        status.cmdName = child.firstChild.nodeValue;
        break;
      case "TargetRef":
        status.targetRef = child.firstChild.nodeValue;
        break;
      case "SourceRef":
        status.sourceRef = child.firstChild.nodeValue;
        break;
      case "Cred":
        status.cred = child.firstChild.nodeValue; //is this correct?
        break;
      case "Chal":
        status.chal = child.firstChild.nodeValue; //is this correct?
        break;
      case "Data":
        status.data = child.firstChild.nodeValue;
        break;
      case "Item":
        status.items.push(readItem(child));
        break;
      default:
        log("WARNING: readStatus does not understand " + child.nodeName + ". Ignored. " + printNode(node));
        break;
      }

      child = child.nextSibling;
    }

    if (!status.data || !status.cmdId || !status.msgRef || status.cmdRef === undefined) {
      throw ({name: "SyntaxError", message: "Need data, cmdId, msgRef and cmdRef for status, not all found: " + printNode(node)});
    }
    return status;
  }

  //helper function to add a status to the msg.
  function addStatusToMsg(status, prefix) {
    var i, nprefix;
    m.push(prefix); m.push("<Status>\n");
    nprefix = prefix + "\t";
    writeCmdId(status, nprefix);
    writeNodeValue("MsgRef", status.msgRef, nprefix);
    writeNodeValue("CmdRef", status.cmdRef, nprefix);
    if (status.cmdName) {
      writeNodeValue("Cmd", status.cmdName, nprefix);
    }
    if (status.targetRef) {
      writeNodeValue("TargetRef", status.targetRef, nprefix);
    }
    if (status.sourceRef) {
      writeNodeValue("SourceRef", status.sourceRef, nprefix);
    }
    if (status.cred) {
      writeNodeValue("Cred", status.cred, nprefix);
    }
    if (status.items) {
      for (i = 0; i < status.items.length; i += 1) {
        addItemToMsg(status.items[i], nprefix);
      }
    }
    writeNodeValue("Data", status.data, nprefix);
    m.push(prefix); m.push("</Status>\n");
  }

  //function to add a single status to the message object:
  function mAddSingleStatus(cmd, name, msgRef) {
    var k, status;
    status = {
      msgRef: msgRef,
      cmdRef: cmd.cmdId,
      cmdName: name,
      targetRef: cmd.target,
      sourceRef: cmd.source,
      items: cmd.items || [],
      meta: cmd.meta,
      data: cmd.failure ? "510" : "200" //set 200 = ok or to 510 = data sore failure for all cmds. 
    };
    for (k = 0; k < status.items.length; k += 1) {
      delete status.items[k].data; //delete data element of status-item, don't resend everything. 
    }
    body.status[msgRef][status.cmdRef] = status; //insert status at right position into body. :)
  }

  //helper function to add a syncCmd to the msg.
  function addSyncCmdToMsg(cmd, prefix) {
    var i;
    writeCmdId(cmd, prefix);
    for (i = 0; i < cmd.items.length; i += 1) {
      addItemToMsg(cmd.items[i], prefix);
    }
  }

  //helper function to parse add/replace commands
  function readAddReplace(node) {
    var obj = { items: []}, child;
    child = node.firstChild;
    while (child) {
      log("add/replace/delete-child: " + child.nodeName);
      switch (child.nodeName) {
      case "CmdID":
        obj.cmdId = child.firstChild.nodeValue;
        break;
      case "Meta":
        obj.meta = readMeta(child);
        break;
      case "Item":
        obj.items.push(readItem(child));
        break;
      default:
        log("WARNING: readAddReplace does not understand " + child.nodeName + ", yet. Value ignored. " + printNode(node));
      }
      child = child.nextSibling;
    }
    if (!obj.cmdId) {
      throw ({name: "SyntaxError", message: "add/replace command needs cmdId, none found: " + printNode(node)});
    }
    //ignoring NoResp, Cred.
    return obj;
  }

  function readDelete(node) {
    //igrnoring SftDelete and Archive.
    return readAddReplace(node);
  }

  //helper function to add sync to the msg:
  function addSyncToMsg(sync, prefix) {
    var i, nprefix;
    if (!sync.target && !sync.source) { // sync.add.length === 0 && sync.del.length === 0 && sync.replace.length === 0) {
      log("Not adding empty sync.");
      return;
    }
    m.push(prefix); m.push("<Sync>\n");
    nprefix = prefix + "\t";
    writeCmdId(sync, nprefix);
    if (!sync.target || !sync.source) {
      throw ({name: "LogicError", message: "Sync command needs target/source. Please add them by calling setSyncTargetSource."});
    }
    addTargetSource(sync, nprefix);
    for (i = 0; i < sync.add.length; i += 1) {
      m.push(nprefix); m.push("<Add>\n");
      addSyncCmdToMsg(sync.add[i], nprefix + "\t");
      m.push(nprefix); m.push("</Add>\n");
    }
    for (i = 0; i < sync.del.length; i += 1) {
      m.push(nprefix); m.push("<Delete>\n");
      addSyncCmdToMsg(sync.del[i], nprefix + "\t");
      m.push(nprefix); m.push("</Delete>\n");
    }
    for (i = 0; i < sync.replace.length; i += 1) {
      m.push(nprefix); m.push("<Replace>\n");
      addSyncCmdToMsg(sync.replace[i], nprefix + "\t");
      m.push(nprefix); m.push("</Replace>\n");
    }
    m.push(prefix); m.push("</Sync>\n");
  }

  //helper function to parse sync:
  function readSync(node) {
    var child, obj, sync = {add: [], del: [], replace: []};

    child = node.firstChild;
    while (child) {
      log("sync-child: " + child.nodeName);
      switch (child.nodeName) {
      case "Add":
        obj = readAddReplace(child);
        if (obj) {
          log("Add an add.");
          sync.add.push(obj);
        } else {
          log("Skipped add: " + JSON.stringify(obj));
        }
        break;
      case "Replace":
        obj = readAddReplace(child);
        if (obj) {
          log("Add an replace.");
          sync.replace.push(obj);
        } else {
          log("Skipped replace: " + JSON.stringify(obj));
        }
        break;
      case "Delete":
        obj = readDelete(child);
        if (obj) {
          log("Add an delete.");
          sync.del.push(obj);
        } else {
          log("Skipped delete: " + JSON.stringify(obj));
        }
        break;
      case "CmdID":
        sync.cmdId = child.firstChild.nodeValue;
        break;
      case "NumberOfChanges":
        sync.numberOfChanges = child.firstChild.nodeValue;
        break;
      case "Target":
        sync.target = readTargetSource(child);
        break;
      case "Source":
        sync.source = readTargetSource(child);
        break;
      default: //ignore: NoResp, Cred, Meta and Atomic, Copy, Move, Sequence.
        log("Unexpected node type (" + child.nodeName + ") in sync received: " + printNode(node));
        break;
      }

      child = child.nextSibling;
    }

    return sync;
  }

  //helper function to parse body values into this message
  function readBody(body) {
    //initialize final to false, because if the final tag is missing, message is not final.
    var node, obj, bodyObj = { isFinal: false, alerts: [], status: {}, sync: [] };

    //parse all childs of the body:
    node = body.firstChild;
    while (node) {
      log("body-child: " + node.nodeName);
      switch (node.nodeName) {
      case "Alert":
        obj = readAlert(node);
        if (obj) {
          bodyObj.alerts.push(obj);
        }
        break;
      case "Status":
        obj = readStatus(node);
        if (obj) {
          if (!bodyObj.status[obj.msgRef]) {
            bodyObj.status[obj.msgRef] = {};
          }
          bodyObj.status[obj.msgRef][obj.cmdRef] = obj;
        }
        break;
      case "Sync":
        obj = readSync(node);
        if (obj) {
          bodyObj.sync.push(obj);
        }
        break;
      case "Final":
        bodyObj.isFinal = true;
        break;
      default:
        log("Unexpected node type (" + node.nodeName + ") in SyncBody received: " + printNode(node));
        break;
      }

      node = node.nextSibling;
    }

    return bodyObj;
  }

  return {
    //public interface:  
    getBody: function () {
      return body;
    },

    getHeader: function () {
      return header;
    },

    //adds credential information to the header.
    addCredentials: function (cred) {
      if (cred.encoded) { // allow to add encoded credentials directly
        header.encodedCredentials = cred.encoded;
      } else { //encode creds:
        if (cred.username && cred.password) {
          var login = cred.username + ":" + cred.password;
          header.encodedCredentials = window.btoa(login);
        } else {
          log("Need cred.encoded or cred.username & cred.password. Please specify one of them.");
          header.encodedCredentials = undefined;
        }
      }
    },

    //returns the complete message as XML
    buildMessage: function (sessionInfo) {
      var msgRef, cmdRef, i, j;

      //check parameters:
      if (!sessionInfo) {
        throw ({name: "InvalidParameters", message: "You need to specify sessionInfo as parameter."});
      }
      if (typeof sessionInfo.sessionId !== 'number' || typeof sessionInfo.msgId !== 'number') {
        throw ({name: "InvalidParamters", message: "You need to specify sessionId and msgId as number-members of sessionInfo parameter." + JSON.stringify(sessionInfo) });
      }
      if (typeof sessionInfo.target !== 'string' || typeof sessionInfo.source !== 'string') {
        throw ({name: "InvalidParamters", message: "You need to specify target and source as string-members of sessionInfo parameter." + JSON.stringify(sessionInfo) });
      }

      //fill own header:
      header.msgId = sessionInfo.msgId;
      header.sessionId = sessionInfo.sessionId;
      header.target = sessionInfo.target;
      header.source = sessionInfo.source;

      m = [];
      m.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
      m.push("<SyncML>\n");

      //sync hdr:
      m.push("\t<SyncHdr><VerDTD>1.2</VerDTD><VerProto>SyncML/1.2</VerProto>\n"); //init header
      writeNodeValue("SessionID", header.sessionId, "\t\t");
      writeNodeValue("MsgID", header.msgId, "\t\t");
      addTargetSource(header, "\t\t"); //source and target paths. Source = on device, target = on server.
      //add optional credentials:
      addCredentialsToHeader();
      m.push("\t</SyncHdr>\n");

      //body:
      m.push("\t<SyncBody>\n");

      if (body.putDevInfo.string) {
        log("Adding putDevInfo...");
        m.push(body.putDevInfo.string);
      }

      //first add status responses:
      for (msgRef in body.status) {
        if (body.status.hasOwnProperty(msgRef)) {
          log("Adding status...");
          for (cmdRef in body.status[msgRef]) {
            if (body.status[msgRef].hasOwnProperty(cmdRef)) {
              addStatusToMsg(body.status[msgRef][cmdRef], "\t\t");
            }
          }
        }
      }

      //add alerts: 
      for (i = 0; i < body.alerts.length; i += 1) {
        log("Adding alert...");
        addAlertToMsg(body.alerts[i], "\t\t");
      }

      //add syncCmd:
      for (i = 0; i < body.sync.length; i += 1) {
        log("Adding sync...");
        addSyncToMsg(body.sync[i], "\t\t");
      }

      //add maps:
      if (body.maps) {
        for (i = 0; i < body.maps.length; i += 1) {
          log("Adding maps...");
          m.push("\t\t<Map>\n");
          writeCmdId(body.maps[i], "\t\t\t");
          addTargetSource(body.maps[i]);
          for (j = 0; j < body.maps[i].mapItems.length; j += 1) {
            m.push("\t\t\t<MapItem>\n");
            addTargetSource(body.maps[i].mapItems[j], "\t\t\t\t");
            m.push("\t\t\t</MapItem>\n");
          }
          m.push("\t\t</Map>\n");
        }
      }

      if (body.isFinal) {
        m.push("\t\t<Final></Final>\n");
      }
      m.push("\t</SyncBody>\n");

      m.push("</SyncML>\n");

      return m.join("");
    },

    //sets the final state of the message.
    setFinal: function (fin) {
      if (typeof fin === 'boolean') {
        body.isFinal = fin;
      }
    },

    buildMessageFromResponse: function (xml) {
      var hdr, bodyXML, responseDOM;
      responseDOM = xmlParser.parseFromString(xml, "text/xml"); //get from XLM String to XML Dom.
      //parse header:
      hdr = responseDOM.getElementsByTagName("SyncHdr")[0];
      if (hdr) {
        header = readHeader(hdr);
      } else {
        throw ({name: "SyntaxError", message: "Could not read SyncHdr of response " + xml});
      }
      log("Header parsing finished.");

      //parse body:
      bodyXML = responseDOM.getElementsByTagName("SyncBody")[0];
      if (bodyXML) {
        body = readBody(bodyXML);
      } else {
        throw ({name: "SyntaxError", message: "Coult not read SyncBody of response " + xml});
      }

      log("Body parsing finished.");
    },

    matchCommandsFromMessage: function (cmds) {
      //matches the statuses in the current message to the commands in the old message 
      //and returns a set of commands that failed.
      var obody = cmds.getBody(), i, j, msgRef = cmds.getHeader().msgId, result = [], cmdId, syncStatus;
      if (!body.status[msgRef]) { //wrong message ref... ?
        log("Wrong msgRef.");
        return undefined;
      }

      //process alerts:
      log("Alerts.");
      if (obody.alerts) {
        for (i = 0; i < obody.alerts.length; i += 1) {
          cmdId = obody.alerts[i].cmdId;
          if (body.status[msgRef][cmdId] && body.status[msgRef][cmdId].data !== "200") {
            result.push({cmd: obody.alerts[i], status: body.status[msgRef][cmdId]});
          }
        }
      }

      //process sync commands:
      log("Syncs.");
      if (obody.syncs) {
        for (i = 0; i < obody.syncs.length; i += 1) {
          log(i);
          cmdId = obody.syncs[i].cmdId;
          log("cmdId: " + cmdId);
          if (body.status[msgRef][cmdId] && body.status[msgRef][cmdId].data !== "200") {
            log("Sync status: " + body.status[msgRef][cmdId].data);
            result.push({cmd: obody.syncs[i], status: body.status[msgRef][cmdId]});
            syncStatus = body.status[msgRef][cmdId];
            syncStatus.addFail = 0; syncStatus.addGood = 0; syncStatus.delFail = 0; syncStatus.delGood = 0; syncStatus.repFail = 0; syncStatus.repGood = 0;

            for (j = 0; j < obody.syncs[i].add.length; j += 1) {
              cmdId = obody.syncs[i].add[j].cmdId;
              if (body.status[msgRef][cmdId] && body.status[msgRef][cmdId].data !== "200") {
                result.push({cmd: obody.syncs[i].add[j], status: body.status[msgRef][cmdId]});
                syncStatus.addFail += 1;
              } else {
                syncStatus.addGood += 1;
              }
            }

            for (j = 0; j < obody.syncs[i].del.length; j += 1) {
              cmdId = obody.syncs[i].del[j].cmdId;
              if (body.status[msgRef][cmdId] && body.status[msgRef][cmdId].data !== "200") {
                result.push({cmd: obody.syncs[i].del[j], status: body.status[msgRef][cmdId]});
                syncStatus.delFail += 1;
              } else {
                syncStatus.delGood += 1;
              }
            }

            for (j = 0; j < obody.syncs[i].replace.length; j += 1) {
              cmdId = obody.syncs[i].replace[j].cmdId;
              if (body.status[msgRef][cmdId] &&
                  (body.status[msgRef][cmdId].data !== "200" ||
                   body.status[msgRef][cmdId].data !== "201")) {
                result.push({cmd: obody.syncs[i].replace[j], status: body.status[msgRef][cmdId]});
                syncStatus.repFail += 1;
              } else {
                if (body.status[msgRef][cmdId].data === "200") {
                  syncStatus.repGood += 1;
                } else if (body.status[msgRef][cmdId].data === "201") { //not replaced but added as new.
                  syncStatus.addGood += 1;
                }
              }
            }
          } else {
            log("Sync cmd was not in this status, will skip all other sync-cmd-parts for this sync cmd.");
          }
        }
      }

      log("putDevInfo");
      if (obody.putDevInfo && obody.putDevInfo.cmdId && body.status[msgRef][obody.putDevInfo.cmdId] && body.status[msgRef][obody.putDevInfo.cmdId].data !== "200") {
        log("Status of putDevInfoCmd: " + body.status[msgRef][obody.putDevInfo.cmdId]);
        result.push({cmd: obody.putDevInfo, status: body.status[msgRef][obody.putDevInfo.cmdId]});
      }

      log("Match commands finished.");
      return result;
    },

    //adds only one status. Call with cmd (like add cmd/alert) and name and msgRef.
    addSingleStatus: mAddSingleStatus,

    addStatuses: function (cmds) {
      //adds status 200 value for a set of commands from the old message to the current message.

      var obody = cmds.getBody(), i, j, msgRef = cmds.getHeader().msgId;
      if (!body.status[msgRef]) { //init msgRef field of body.
        body.status[msgRef] = {};
      }

      //process alerts:
      if (obody.alerts) {
        for (i = 0; i < obody.alerts.length; i += 1) {
          mAddSingleStatus(obody.alerts[i], "Alert", msgRef);
        }
      }

      //process sync commands:
      if (obody.sync) {
        for (i = 0; i < obody.sync.length; i += 1) {
          //only add status if there is anything in this sync.
          if ((obody.sync[i].add && obody.sync[i].add.length !== 0) ||
              (obody.sync[i].del && obody.sync[i].del.length !== 0) ||
              (obody.sync[i].replace && obody.sync[i].replace.length !== 0)) {
            mAddSingleStatus(obody.sync[i], "Sync", msgRef);

            for (j = 0; j < obody.sync[i].add.length; j += 1) {
              mAddSingleStatus(obody.sync[i].add[j], "Add", msgRef);
            }

            for (j = 0; j < obody.sync[i].del.length; j += 1) {
              mAddSingleStatus(obody.sync[i].del[j], "Delete", msgRef);
            }

            for (j = 0; j < obody.sync[i].replace.length; j += 1) {
              mAddSingleStatus(obody.sync[i].del[j], "Replace", msgRef);
            }
          }
        }
      }
    },

    addAlert: function (alert) {
      //adds a alert - cmd to the message. Params: Alert Code, optional item, meta, source / target ...
      // alert = { data: alert-code, items: [{ target: targetURI, source: sourceURI, meta: { anchor: { last: TS, next: TS }, (data: optional)]* } 

      if (alert && alert.data) { //only alert.data really mandatory.
        body.alerts.push(alert);
      }
    },

    //only one syncCmd is currently supported. Will add every cmds here to this first syncCmd.
    addSyncCmd: function (cmd) {
      //adds add / replace /delete to the sync cmd of the message. 
      //need to give type (add/replace/delete), and the item.
      //item = { cmd: { type: add/del/replace, item: { data: ".....", source: localId, meta: { type: text/calendar, format: b64 }}}} //format necessary if data is b64 encoded.

      if (cmd.type !== "add" && cmd.type !== "del" && cmd.type !== "replace") {
        throw ({ name: "Invalid Parameters", message: "type needs to be add, del or replace." });
      }

      var obj = { items: [cmd.item] };

      body.sync[0][cmd.type].push(obj);
    },

    //sets the sync source and target for the sync cmd. 
    //this is necessary to initialize the sync cmd.
    setSyncTargetSource: function (info) {
      body.sync[0].target = info.target;
      body.sync[0].source = info.source;
    },

    addPutDevInfo: function (DeviceInfo, datastores) {
      var devInfo = [], i;
      devInfo.push("\n\t\t\t\t<DevInf xmlns='syncml:devinf'>\n\t\t\t\t\t<VerDTD>1.2</VerDTD>\n");
      devInfo.push("\t\t\t\t\t<Man>" + DeviceInfo.man + "</Man>\n");
      devInfo.push("\t\t\t\t\t<Mod>" + DeviceInfo.mod + "</Mod>\n");
      devInfo.push("\t\t\t\t\t<OEM>" + DeviceInfo.oem + "</OEM>\n");
      devInfo.push("\t\t\t\t\t<FwV>" + DeviceInfo.fwv + "</FwV>\n");
      devInfo.push("\t\t\t\t\t<SwV>" + DeviceInfo.swv + "</SwV>\n");
      devInfo.push("\t\t\t\t\t<HwV>" + DeviceInfo.hwv + "</HwV>\n");
      devInfo.push("\t\t\t\t\t<DevID>" + DeviceInfo.devID + "</DevID>\n");
      devInfo.push("\t\t\t\t\t<DevTyp>" + DeviceInfo.devType + "</DevTyp>\n");
      devInfo.push("\t\t\t\t\t<UTC/>\n"); //tell server to send in time UTC.
      devInfo.push("\t\t\t\t\t<SupportNumberOfChanges/>\n"); //tell server that we support number of changes.

      if (DeviceInfo.largeObjectSupport) {
        devInfo.push("\t\t\t\t\t<SupportLargeObjs/>\n"); //tell server to support large objects.
      }

      //add info about local data stores.
      for (i = 0; i < datastores.length; i += 1) {
        devInfo.push("\t\t\t\t\t<DataStore>\n");
        devInfo.push("\t\t\t\t\t\t<SourceRef>" + datastores[i].name + "</SourceRef>\n");
        devInfo.push("\t\t\t\t\t\t<Rx-Pref>\n");
        devInfo.push("\t\t\t\t\t\t\t<CTType>" + datastores[i].type + "</CTType>\n");
        devInfo.push("\t\t\t\t\t\t\t<VerCT></VerCT>\n");
        devInfo.push("\t\t\t\t\t\t</Rx-Pref>\n");
        devInfo.push("\t\t\t\t\t\t<Tx-Pref>\n");
        devInfo.push("\t\t\t\t\t\t\t<CTType>" + datastores[i].type + "</CTType>\n");
        devInfo.push("\t\t\t\t\t\t\t<VerCT></VerCT>\n");
        devInfo.push("\t\t\t\t\t\t</Tx-Pref>\n");
        devInfo.push("\t\t\t\t\t\t<SyncCap>\n");
        devInfo.push("\t\t\t\t\t\t\t<SyncType>1</SyncType>\n"); //two-way sync
        devInfo.push("\t\t\t\t\t\t\t<SyncType>2</SyncType>\n"); //slow two-way sync
        devInfo.push("\t\t\t\t\t\t\t<SyncType>3</SyncType>\n");
        devInfo.push("\t\t\t\t\t\t\t<SyncType>4</SyncType>\n");
        devInfo.push("\t\t\t\t\t\t\t<SyncType>5</SyncType>\n");
        //devInfo.push("\t\t\t\t\t\t\t<SyncType>7</SyncType>\n"); //sever alerted sync TODO: have a look if we can support that. Does a server exist that does this?? Why is this 7 and not 6??
        devInfo.push("\t\t\t\t\t\t</SyncCap>\n");
        devInfo.push("\t\t\t\t\t</DataStore>\n\t\t\t\t</DevInf>\n\t\t\t\t");
      }

      m = [];
      m.push("\t\t<Put>\n");
      writeCmdId(body.putDevInfo, "\t\t\t");
      addMetaToMsg({ type: "applicytion/vnd.syncml-devinf+xml" }, "\t\t\t");
      addItemToMsg({ source: "./devinf12", data: devInfo.join("") }, "\t\t\t");
      m.push("\t\t</Put>\n");
      body.putDevInfo.string = m.join("");
    },

    //adds a mapping of local ids to global ids. Used as response of add commands.
    //map = { source: "calendars/contacts", target: "calendars/contacts sync Path", 
    //         mapItems: [ { target: "globaleId", source: "localeId" }, ... ]
    //    }
    addMap: function (map) {
      if (map && map.mapItems && map.mapItems.length > 0) {
        if (!body.maps) {
          body.maps = [];
        }
        body.maps.push(map);
      }
    },

    //returns true if there is a status cmd in this message.
    hasStatus: function () {
      var msgRef, cmdRef;
      //first add status responses:
      for (msgRef in body.status) {
        if (body.status.hasOwnProperty(msgRef)) {
          log("Adding status...");
          for (cmdRef in body.status[msgRef]) {
            if (body.status[msgRef].hasOwnProperty(cmdRef)) {
              return true;
            }
          }
        }
      }
      return false;
    }

  }; //end of public interface.
};
