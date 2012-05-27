//Class to generate and parse SyncML Messages.
//JSlint options:
/*global DOMParser, log, Base64 */
"use strict";

var syncMLMessage = function () {
  //private members:
  var m = [], //will contain message elements
    header = { //will contain information about the header.
      encodedCredentials: undefined,  //credentials to authenticate user on the server.                  

      //response things:
      respURI: undefined,                 //server might return a response url that is to be used in following communication.
      msgId: undefined,               //response msgId, use to filter duplicates
      sessionId: undefined,           //response sessionId, use to filter false packets.
      cmdId: "0"                      //header has cmdId 0 for status cmds. :)
    },
    body = { //will contain information about the body.
      alerts: [], //contains alerts. Should be mostly just one for sync initialization...
      status: {}, //contains status reports = aks/nacks of previous commands
      sync: [ { add: [], del: [], replace: [] } ],   //contains sync commands add/replace/delete
      map: [], //mapping used to map local ids to global ids for new items from server
      cmds: [],
      isFinal: true //final needs to be specified in the last message of the "SyncML Package".. 
    },
    //helper to parse XML text messages.
    xmlParser = new DOMParser(),
    cmdId = 0, //necessary to start with Id 1.
    types = ["add", "del", "replace"], typeCmds = ["Add", "delete", "Replace"]; //easier looping through sync cmds.

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

  function cleanUpXML(xml) {
    //have <Add> or <Replace> followed by any data including new lines until the next <Data> after that have anything but <,> and &, including \r and \n.
    //then have a <, > or & followed by any data but <, > and &. This may happen more than once, until the next </Data>.
    //this did not work.. don't know why.. just crashed without exception. webkit sucks.
    //so now we just check every data of add/replace things and just call this method, if xmlParse fails the first time.
    var patt = /(<Add>|<Replace>)(.|\r\n)*?<Data>(.|\r\n)*?<\/Data>/gmi, endOfData, startOfData, offset, data, xml2;
    xml2 = "";
    offset = 0;
    log("Trying to clean up xml");
    while (patt.test(xml) === true) {
      //now lastIndex is the index of the interfering </Data>. Go back a bit:
      endOfData = patt.lastIndex - 8; //this should be the end of the data.
      startOfData = xml.lastIndexOf("<Data>", endOfData) + 6;
      data = xml.substring(startOfData, endOfData - 1);
      //log("Offending data: " + data);
      data = data.replace(/&(?!\w{2,3};)/gmi, "&amp;"); //all & that are not followed by 2 or 3 word characters and a ;.
      data = data.replace(/</gmi, "&lt;");
      data = data.replace(/>/gmi, "&gt;");
      //log("Quoted: " + data);
      xml2 += xml.substring(offset, startOfData) + data; //add beginning of message or since last change and add modified data.
      offset = endOfData;
    }
    xml2 += xml.substring(offset); //add rest of message
    return xml2;
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
      m.push(prefix);
      m.push("<Target><LocURI>");
      m.push(info.target);
      m.push("</LocURI></Target>\n");
    }
    if (info.source) {
      m.push(prefix);
      m.push("<Source><LocURI>");
      m.push(info.source);
      m.push("</LocURI></Source>\n");
    }
  }

  function readTargetSource(node) {
    var child = node.firstChild;
    while (child) {
      //log("Target/Source-child: " + child.nodeName);
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
      //log("Anchor-child: " + child.nodeName);
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
      //log("meta-child: " + child.nodeName);
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
      case "MaxObjSize":
        meta.maxObjSize = child.firstChild.nodeValue;
        break;
      case "Size":
        meta.size = child.firstChild.nodeValue;
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
    var header = { cmdId: "0"}, child;
    child = hdr.firstChild;
//    log("First child: " + child);
    while (child) {
      //log("header-child: " + child.nodeName);
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
//      log("Next sibling: " + child);
    }
    return header;
  }

  //helper function to add meta to msg
  function addMetaToMsg(meta, prefix) {
    m.push(prefix);
    m.push("<Meta>\n");
    var nprefix = prefix + "\t";
    if (meta.anchor) {
      m.push(nprefix);
      m.push("<Anchor xmlns='syncml:metinf'>\n");
      if (meta.anchor.last) {
        writeNodeValue("Last", meta.anchor.last, nprefix + "\t", false);
      }
      writeNodeValue("Next", meta.anchor.next, nprefix + "\t", false);
      m.push(nprefix);
      m.push("</Anchor>\n");
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
    if (meta.size) {
      writeNodeValue("Size", meta.size, nprefix, true);
    }
    m.push(prefix);
    m.push("</Meta>\n");
  }

  //helper function to parse items
  function readItem(node) {
    var child, item = {};

    //may have: Target, Source, Meta, Data. Not supported by me: SourceParent, TargetPartent :)
    child = node.firstChild;
    while (child) {
      //log("item-child: " + child.nodeName);
      switch (child.nodeName) {
      case "Data":
        item.data = child.firstChild ? child.firstChild.nodeValue : "";
        if (!item.data || item.data === "" || item.data === null) {
//          if (child.firstChild) {
//            item.data = printNode(child.firstChild);
//          } else {
//            item.data = printNode(child); //will also add data. I don't like that.. hm.            
//          }
          item.data = child.firstChild;
        }
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
    m.push(prefix);
    m.push("<Item>\n");
    var nprefix = prefix + "\t";
    addTargetSource(item, nprefix);
    if (item.meta) {
      addMetaToMsg(item.meta, nprefix);
    }
    if (item.data) {
      m.push("\n<Data>" + item.data + "</Data>\n");
      //writeNodeValue("Data", item.data, "");
    }
    m.push(prefix);
    m.push("</Item>\n");
  }

  //helper function to parse alerts
  function readAlert(node) {
    var alert = {}, child;
    child = node.firstChild;
    while (child) {
      //log("alert-child: " + child.nodeName);
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
    m.push(prefix);
    m.push("<Alert>\n");
    nprefix = prefix + "\t";
    writeCmdId(alert, nprefix);
    writeNodeValue("Data", alert.data, nprefix);
    if (alert.items) {
      for (i = 0; i < alert.items.length; i += 1) {
        addItemToMsg(alert.items[i], nprefix);
      }
    }
    m.push(prefix);
    m.push("</Alert>\n");
  }

  //helper function to parse status
  function readStatus(node) {
    var status = { items: []}, child, item;
    child = node.firstChild;
    while (child) {
      //log("status-child: " + child.nodeName);
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
        item = readItem(child);
        if (typeof item.data === "object") {
          item.data = "removed object";
        }
        status.items.push(item);
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
    m.push(prefix);
    m.push("<Status>\n");
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
    m.push(prefix);
    m.push("</Status>\n");
  }

  //function to add a single status to the message object:
  function mAddSingleStatus(cmd, name, msgRef) {
    var k, status;
    if (!cmd.status) {
      cmd.status = "200"; //TODO: change this to something like "not supported" and add a status item to all processed cmds in SyncML.js!
    }
    status = {
      msgRef: msgRef,
      cmdRef: cmd.cmdId,
      cmdName: name,
      targetRef: cmd.target,
      sourceRef: cmd.source,
      items: cmd.items || [],
      meta: cmd.meta,
      data: cmd.status
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
      //log("add/replace/delete-child: " + child.nodeName);
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
      case "MsgRef":
        obj.msgRef = child.firstChild.nodeValue;
        break;
      case "CmdRef":
        obj.cmdRef = child.firstChild.nodeValue;
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

  function readCmd(node) {
    //for GET this ignores Lang.
    return readAddReplace(node); //most cmds are very similar to them.
  }

  function readDelete(node) {
    //igrnoring SftDelete and Archive.
    return readAddReplace(node);
  }

  //helper function to add sync to the msg:
  function addSyncToMsg(sync, prefix) {
    var i, nprefix;
    if (!sync.target && !sync.source) { // sync.add.length === 0 && sync.del.length === 0 && sync.replace.length === 0) {
      //log("Not adding empty sync.");
      return;
    }
    m.push(prefix);
    m.push("<Sync>\n");
    nprefix = prefix + "\t";
    writeCmdId(sync, nprefix);
    if (!sync.target || !sync.source) {
      throw ({name: "LogicError", message: "Sync command needs target/source. Please add them by calling setSyncTargetSource."});
    }
    addTargetSource(sync, nprefix);
    for (i = 0; i < sync.add.length; i += 1) {
      m.push(nprefix);
      m.push("<Add>\n");
      addSyncCmdToMsg(sync.add[i], nprefix + "\t");
      m.push(nprefix);
      m.push("</Add>\n");
    }
    for (i = 0; i < sync.del.length; i += 1) {
      m.push(nprefix);
      m.push("<Delete>\n");
      addSyncCmdToMsg(sync.del[i], nprefix + "\t");
      m.push(nprefix);
      m.push("</Delete>\n");
    }
    for (i = 0; i < sync.replace.length; i += 1) {
      m.push(nprefix);
      m.push("<Replace>\n");
      addSyncCmdToMsg(sync.replace[i], nprefix + "\t");
      m.push(nprefix);
      m.push("</Replace>\n");
    }
    m.push(prefix);
    m.push("</Sync>\n");
  }

  //helper function to parse sync:
  function readSync(node) {
    var child, obj, sync = {add: [], del: [], replace: []};

    child = node.firstChild;
    while (child) {
      //log("sync-child: " + child.nodeName);
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
    var node, obj, bodyObj = { isFinal: false, alerts: [], status: {}, sync: [], cmds: [] };

    //parse all childs of the body:
    node = body.firstChild;
    while (node) {
      //log("body-child: " + node.nodeName);
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
        log("Read is final!");
        bodyObj.isFinal = true;
        break;
      case "Get":
        obj = readCmd(node);
        if (obj) {
          obj.type = "Get";
          bodyObj.cmds.push(obj);
        }
        break;
      case "Results":
        obj = readCmd(node);
        if (obj) {
          obj.type = "Results";
          bodyObj.cmds.push(obj);
        }
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

    isFinal: function () {
      return body.isFinal;
    },

    //adds credential information to the header.
    addCredentials: function (cred) {
      if (cred.encoded) { // allow to add encoded credentials directly
        header.encodedCredentials = cred.encoded;
      } else { //encode creds:
        if (cred.username && cred.password) {
          var login = cred.username + ":" + cred.password;
          header.encodedCredentials = Base64.encode(login);
        } else {
          log("Need cred.encoded or cred.username & cred.password. Please specify one of them.");
          header.encodedCredentials = undefined;
        }
      }
    },

    //returns the complete message as XML
    buildMessage: function (sessionInfo) {
      var msgRef = undefined, cmdRef = undefined, i, j;

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
      m.push("\t<Meta><MaxMsgSize xmlns=\"syncml:metinf\">512000</MaxMsgSize></Meta>\n");
      m.push("\t</SyncHdr>\n");

      //body:
      m.push("\t<SyncBody>\n");

      //first add status responses:
      for (msgRef in body.status) {
        if (body.status.hasOwnProperty(msgRef)) {
          //log("Adding status...");
          for (cmdRef in body.status[msgRef]) {
            if (body.status[msgRef].hasOwnProperty(cmdRef)) {
              addStatusToMsg(body.status[msgRef][cmdRef], "\t\t");
            }
          }
        }
      }

      //add alerts: 
      for (i = 0; i < body.alerts.length; i += 1) {
        //log("Adding alert...");
        addAlertToMsg(body.alerts[i], "\t\t");
      }

      //add syncCmd:
      for (i = 0; i < body.sync.length; i += 1) {
        //log("Adding sync...");
        addSyncToMsg(body.sync[i], "\t\t");
      }

      //add maps:
      if (body.maps) {
        for (i = 0; i < body.maps.length; i += 1) {
          //log("Adding maps...");
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

      if (body.getDevInfo) {
        m.push("\t\t<Get>\n");
        writeCmdId(body.getDevInfo, "\t\t\t");
        addMetaToMsg({type: "application/vnd.syncml-devinf+xml"}, "\t\t\t");
        addItemToMsg({ target: "./devinf12" }, "\t\t\t");
        m.push("\t\t</Get>\n");
      }

      //add device info.
      if (body.cmds) {
        for (i = 0; i < body.cmds.length; i += 1) {
          if (body.cmds[i].type === "Results" || body.cmds[i].type === "Put") {
            m.push("<" + body.cmds[i].type + ">\n");
            writeCmdId(body.cmds[i], "\t\t\t");
            if (body.cmds[i].type === "Results") {
              writeNodeValue("MsgRef", body.cmds[i].msgRef, "\t\t\t");
              writeNodeValue("CmdRef", body.cmds[i].cmdRef, "\t\t\t");
            }
            addMetaToMsg(body.cmds[i].meta, "\t\t\t");
            addItemToMsg(body.cmds[i].item, "\t\t\t");
            m.push("</" + body.cmds[i].type + ">\n");
          }
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
      var hdr, bodyXML, responseDOM, cleanXML, errors;
      cleanXML = xml.replace(/>\s+</g, "><"); //remove all whitespaces between > and <
      cleanXML = cleanXML.replace(/<Data><\!\[CDATA\[/g,"<Data>");
      cleanXML = cleanXML.replace(/\]\]><\/\s*Data>/g,"</Data>");
      log("Cleaned up: " + cleanXML);
      responseDOM = xmlParser.parseFromString(cleanXML, "text/xml"); //get from XLM String to XML Dom.
      log("Parser finished");
      errors = responseDOM.documentElement.getElementsByTagName ("parsererror");
      if (errors.length > 0) {
        log("Had xml parse Errors, clean up xml and retry.");
        //for (i = 0; i < errors.length; i += 1) {
        //  log(i + ": " + printNode(errors[i]));
        //}
        cleanXML = cleanUpXML(cleanXML); //tries to repair xml errors from unquoted data.
        responseDOM = xmlParser.parseFromString(cleanXML, "text/xml"); //get from XLM String to XML Dom.
        errors = responseDOM.documentElement.getElementsByTagName("parsererror");
        if (errors.length > 0) {
          log("Still have errors. :(");
          log("Complete message: " + cleanXML);
          throw ({name: "SyntaxError", message: "Could not parse xml message, even not after clean up. Please report incident!"});
        }
      }
      //parse header:
      hdr = responseDOM.documentElement.getElementsByTagName("SyncHdr").item(0);
      if (hdr) {
        header = readHeader(hdr);
      } else {
        throw ({name: "SyntaxError", message: "Could not read SyncHdr of response " + cleanXML});
      }
      log("Header parsing finished.");

      //parse body:
      bodyXML = responseDOM.documentElement.getElementsByTagName("SyncBody").item(0);
      if (bodyXML) {
        body = readBody(bodyXML);
      } else {
        throw ({name: "SyntaxError", message: "Coult not read SyncBody of response " + cleanXML});
      }
      log("Body parsing finished.");
    },

    matchCommandsFromMessage: function (cmds) {
      //matches the statuses in the current message to the commands in the old message 
      //and returns a set of commands that failed.
      var obody = cmds.getBody(), i, j, msgRef = cmds.getHeader().msgId, result = [], cmdId, syncStatus, ti, sync, cmd;
      if (!body.status[msgRef]) { //wrong message ref... ?
        log("Wrong msgRef " + msgRef + " (might also mean that server did not send any status cmds.)");
        return undefined;
      }

      //header:
      if (body.status[msgRef][0] && body.status[msgRef][0].data !== "200" && body.status[msgRef][0].data !== "212") {
        //header failed, most probably not authenticated.
        result.push({cmd: cmds.getHeader(), status: body.status[msgRef][0]});
      }

      //process alerts:
      //log("Alerts.");
      if (obody.alerts) {
        for (i = 0; i < obody.alerts.length; i += 1) {
          cmdId = obody.alerts[i].cmdId;
          if (body.status[msgRef][cmdId] && body.status[msgRef][cmdId].data !== "200") {
            result.push({cmd: obody.alerts[i], status: body.status[msgRef][cmdId]});
          }
        }
      }

      //process sync commands:
      if (obody.sync) {
        for (i = 0; i < obody.sync.length; i += 1) {
          sync = obody.sync[i];
          cmdId = sync.cmdId;
          if (cmdId || cmdId === 0) {
            if (body.status[msgRef][cmdId]) {
              syncStatus = body.status[msgRef][cmdId];
              syncStatus.add = {fail: 0, good: 0};
              syncStatus.del = {good: 0, fail: 0};
              syncStatus.replace = {good: 0, fail: 0};

              for (ti = 0; ti < types.length; ti += 1) {
                for (j = 0; j < sync[types[ti]].length; j += 1) {
                  cmd = sync[types[ti]][j];
                  cmdId = cmd.cmdId;
                  if (body.status[msgRef][cmdId]) {
                    if ((body.status[msgRef][cmdId].data === "200") ||                            //all fine
                        (body.status[msgRef][cmdId].data === "201" && types[ti] === "replace") || //add instead of replace
                        (body.status[msgRef][cmdId].data === "418" && types[ti] === "add")     || //was already there
                        (body.status[msgRef][cmdId].data === "418" && types[ti] === "replace") || //was already there
                        (body.status[msgRef][cmdId].data === "208")                            || //conflict, but client won.
                        (body.status[msgRef][cmdId].data === "211" && types[ti] === "del")) {     //item already deleted
                      syncStatus[types[ti]].good += 1;
                    } else {
                      result.push({cmd: cmd, status: body.status[msgRef][cmdId]});
                      syncStatus[types[ti]].fail += 1;
                    }
                  } else {
                    log("Not status for cmd: " + JSON.stringify(cmd));
                  }
                }

                cmdId = sync.cmdId;
                if (body.status[msgRef][cmdId].data !== "200") {
                  result.push({cmd: sync, status: body.status[msgRef][cmdId]});
                }
              }
            } else {
              log("Sync cmd was not in this status, will skip all other sync-cmd-parts for this sync cmd.");
            }
          }
        }
      }

      if (obody.cmds) {
        for (i = 0; i < obody.cmds.length; i += 1) {
          if (body.status[msgRef][obody.cmds[i].cmdId] && body.status[msgRef][obody.cmds[i].cmdId].data !== "200") {
            result.push({cmd: obody.cmds[i], status: body.status[msgRef][obody.cmds[i].cmdId]});
          }
        }
      }

      log("Match commands finished.");
      return result;
    },

    //adds only one status. Call with cmd (like add cmd/alert) and name and msgRef.
    addSingleStatus: mAddSingleStatus,

    addStatuses: function (cmds) {
      //adds status 200 value for a set of commands from the old message to the current message.

      var obody = cmds.getBody(), i, j, msgRef = cmds.getHeader().msgId, ti;
      if (!msgRef) {
        return;
      }
      if (!body.status[msgRef]) { //init msgRef field of body.
        body.status[msgRef] = {};
      }

      mAddSingleStatus(cmds.getHeader(), "SyncHdr", msgRef);
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
          if (obody.sync[i].target || obody.sync[i].source) {
            mAddSingleStatus(obody.sync[i], "Sync", msgRef);

            for (ti = 0; ti < types.length; ti += 1) {
              for (j = 0; j < obody.sync[i][types[ti]].length; j += 1) {
                mAddSingleStatus(obody.sync[i][types[ti]][j], typeCmds[ti], msgRef);
              }              
            }
          }
        }
      }

      if (obody.cmds) {
        for (i = 0; i < obody.cmds.length; i += 1) {
          mAddSingleStatus(obody.cmds[i], obody.cmds[i].type, msgRef);
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

    addPutDevInfo: function (DeviceInfo, datastores, cmd) {
      var devInfo = [], i, c = {};
      devInfo.push("\n<DevInf xmlns=\"syncml:devinf\"><VerDTD>1.2</VerDTD>\n");
      devInfo.push("<DevID>" + DeviceInfo.devID + "</DevID>\n");
      devInfo.push("<Man>" + DeviceInfo.man + "</Man>\n");
      devInfo.push("<Mod>" + DeviceInfo.mod + "</Mod>\n");
      devInfo.push("<OEM>" + DeviceInfo.oem + "</OEM>\n");
      devInfo.push("<FwV>" + DeviceInfo.fwv + "</FwV>\n");
      devInfo.push("<SwV>" + DeviceInfo.swv + "</SwV>\n");
      devInfo.push("<HwV>" + DeviceInfo.hwv + "</HwV>\n");
      devInfo.push("<DevTyp>" + DeviceInfo.devType + "</DevTyp>\n");
      //devInfo.push("<UTC/>\n"); //tell server to send in time UTC.
      devInfo.push("<UTC/>\n");
      devInfo.push("<SupportNumberOfChanges/>\n"); //tell server that we support number of changes.

      if (DeviceInfo.largeObjectSupport) {
        devInfo.push("<SupportLargeObjs/>\n"); //tell server to support large objects.
      }

      //add info about calendar:
      devInfo.push("<DataStore>\n");
      devInfo.push("<SourceRef>calendar</SourceRef>\n");
      devInfo.push("<Rx-Pref>\n");
      devInfo.push("<CTType>text/calendar</CTType>\n");
      devInfo.push("<VerCT>2.0</VerCT>\n");
      devInfo.push("</Rx-Pref>\n");
      devInfo.push("<Rx>\n");
      devInfo.push("<CTType>text/x-vcalendar</CTType>\n");
      devInfo.push("<VerCT>1.0</VerCT>\n");
      devInfo.push("</Rx>\n");
      devInfo.push("<Tx-Pref>\n");
      devInfo.push("<CTType>text/calendar</CTType>\n");      
      devInfo.push("<VerCT>2.0</VerCT>\n");
      devInfo.push("</Tx-Pref>\n");
      devInfo.push("<Tx>\n");
      devInfo.push("<CTType>text/x-vcalendar</CTType>\n");      
      devInfo.push("<VerCT>1.0</VerCT>\n");
      devInfo.push("</Tx>\n");
      devInfo.push("<CTCap>\n");
      devInfo.push("<CTType>" + MimeTypes.calendar.pref + "</CTType>\n");
      devInfo.push("<VerCT>2.0</VerCT>\n");
      devInfo.push("<Property>\n");
      devInfo.push("<PropName>BEGIN</PropName><ValEnum>VCALENDAR</ValEnum><ValEnum>VALARM</ValEnum><ValEnum>VEVENT</ValEnum></Property>\n");
      devInfo.push("<Property><PropName>END</PropName><ValEnum>VCALENDAR</ValEnum><ValEnum>VALARM</ValEnum><ValEnum>VEVENT</ValEnum></Property>\n");
      devInfo.push("<Property><PropName>VERSION</PropName><ValEnum>2.0</ValEnum><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>PRODID</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>TZID</PropName></Property>\n");
      devInfo.push("<Property><PropName>DTSTART</PropName></Property>\n");
      devInfo.push("<Property><PropName>RRULE</PropName></Property>\n");
      devInfo.push("<Property><PropName>LAST-MODIFIED</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>DTSTAMP</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>CREATED</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>UID</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>SEQUENCE</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>GEO</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>CATEGORIES</PropName></Property>\n");
      devInfo.push("<Property><PropName>CLASS</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>SUMMARY</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>DESCRIPTION</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>LOCATION</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>URL</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>PRIORITY</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>RELATED-TO</PropName><MaxOccur>1</MaxOccur><PropParam><ParamName>RELTYPE</ParamName><ValEnum>PARENT</ValEnum></PropParam></Property>\n");
      devInfo.push("<Property><PropName>TRIGGER</PropName><MaxOccur>1</MaxOccur><PropParam><ParamName>VALUE</ParamName></PropParam><PropParam><ParamName>RELATED</ParamName><ValEnum>START</ValEnum><ValEnum>END</ValEnum></PropParam></Property>\n");
      devInfo.push("<Property><PropName>ACTION</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>REPEAT</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>TRANSP</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>RECURRENCE-ID</PropName><MaxOccur>1</MaxOccur><PropParam><ParamName>VALUE</ParamName></PropParam></Property>\n");
      devInfo.push("<Property><PropName>EXDATE</PropName></Property>\n");
      devInfo.push("<Property><PropName>DTEND</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>DURATION</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>ATTENDEE</PropName>" +
          "<PropParam><ParamName>CN</ParamName></PropParam>" +
          "<PropParam><ParamName>PARTSTAT</ParamName>" +
          "<ValEnum>NEEDS-ACTION</ValEnum>" +
          "<ValEnum>ACCEPTED</ValEnum>" +
          "<ValEnum>DECLINED</ValEnum>" +
          "<ValEnum>TENTATIVE</ValEnum>" +
          "<ValEnum>DELEGATED</ValEnum></PropParam>" +
          "<PropParam><ParamName>ROLE</ParamName><ValEnum>CHAIR</ValEnum><ValEnum>REQ-PARTICIPANT</ValEnum><ValEnum>OPT-PARTICIPANT</ValEnum><ValEnum>NON-PARTICIPANT</ValEnum></PropParam>" +
          "<PropParam><ParamName>RSVP</ParamName><ValEnum>TRUE</ValEnum><ValEnum>FALSE</ValEnum></PropParam>" +
          "<PropParam><ParamName>LANGUAGE</ParamName></PropParam>" +
          "<PropParam><ParamName>CUTYPE</ParamName><ValEnum>INDIVIDUAL</ValEnum><ValEnum>GROUP</ValEnum><ValEnum>RESOURCE</ValEnum><ValEnum>ROOM</ValEnum><ValEnum>UNKNOWN</ValEnum></PropParam></Property>" +
      "<Property><PropName>ORGANIZER</PropName><MaxOccur>1</MaxOccur><PropParam><ParamName>CN</ParamName></PropParam></Property>\n");
      devInfo.push("</CTCap>\n");
      devInfo.push("<CTCap>\n");
      devInfo.push("<CTType>" + MimeTypes.calendar.fallback + "</CTType><VerCT>1.0</VerCT>\n");
      devInfo.push("<Property><PropName>BEGIN</PropName><ValEnum>VCALENDAR</ValEnum><ValEnum>VEVENT</ValEnum></Property>\n");
      devInfo.push("<Property><PropName>END</PropName><ValEnum>VCALENDAR</ValEnum><ValEnum>VEVENT</ValEnum></Property>\n");
      devInfo.push("<Property><PropName>VERSION</PropName><ValEnum>1.0</ValEnum><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>GEO</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>LAST-MODIFIED</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>UID</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>SEQUENCE</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>CATEGORIES</PropName></Property>\n");
      devInfo.push("<Property><PropName>CLASS</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>SUMMARY</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>DESCRIPTION</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>LOCATION</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>URL</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>DTSTART</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>PRIORITY</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>AALARM</PropName><MaxOccur>1</MaxOccur></Property>\n");
      //devInfo.push("<Property><PropName>DALARM</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>RELATED-TO</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>TRANSP</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>RRULE</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>EXDATE</PropName></Property>\n");
      devInfo.push("<Property><PropName>DTEND</PropName><MaxOccur>1</MaxOccur></Property>\n");
      devInfo.push("<Property><PropName>ATTENDEE</PropName><PropParam><ParamName>ROLE</ParamName><ValEnum>ORGANIZER</ValEnum></PropParam><PropParam><ParamName>STATUS</ParamName><ValEnum>NEEDS ACTION</ValEnum><ValEnum>ACCEPTED</ValEnum><ValEnum>DECLINED</ValEnum><ValEnum>TENTATIVE</ValEnum><ValEnum>DELEGATED</ValEnum></PropParam></Property>\n");
      devInfo.push("</CTCap>\n");
      devInfo.push("<SyncCap>\n");
      devInfo.push("<SyncType>1</SyncType>\n"); //two-way sync
      devInfo.push("<SyncType>2</SyncType>\n"); //slow two-way sync
      devInfo.push("<SyncType>3</SyncType>\n");
      devInfo.push("<SyncType>4</SyncType>\n");
      devInfo.push("<SyncType>5</SyncType>\n");
      //devInfo.push("<SyncType>7</SyncType>\n"); //sever alerted sync TODO: have a look if we can support that. Does a server exist that does this?? Why is this 7 and not 6??
      devInfo.push("</SyncCap>\n");
      devInfo.push("</DataStore>\n</DevInf>\n");

      m = [];
      if (cmd && cmd.type === "Results") {
        c.type = "Results"; 
        c.msgRef = cmd.msgId;
        c.cmdRef = cmd.cmdId;
      } else {
        c.type = "Put";
      }
      c.meta = { type: "applicytion/vnd.syncml-devinf+xml" };
      c.item = { source: "./devinf12", data: devInfo.join("") };
      
      if (!body.cmds) {
        body.cmds = [];
      }
      body.cmds.push(c);
    },

    doGetDevInfo: function () {
      body.getDevInfo = {};
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
      var msgRef = undefined, cmdRef = undefined;
      //first add status responses:
      for (msgRef in body.status) {
        if (body.status.hasOwnProperty(msgRef)) {
          for (cmdRef in body.status[msgRef]) {
            if (body.status[msgRef].hasOwnProperty(cmdRef) && cmdRef !== "0") {
              return true;
            }
          }
        }
      }
      return false;
    },

    //made print node public for debug purposes.
    printNode: printNode

  }; //end of public interface.
};
