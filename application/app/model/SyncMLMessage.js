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
      url: undefined,                 //server might return a response url that is to be used in following communication.
      msgId: undefined,               //response msgId, use to filter duplicates
      sessionId: undefined            //response sessionId, use to filter false packets.
    },
    body = { //will contain information about the body.
      alerts: [], //contains alerts. Should be mostly just one for sync initialization...
      status: {}, //contains status reports = aks/nacks of previous commands
      sync: [ { add: [], del: [], replace: [] } ],   //contains sync commands add/replace/delete
      isFinal: true //final needs to be specified in the last message of the "SyncML Package".. TODO: find out what "package" means. More messages, because one would  be to big??
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
  function writeCmdId(prefix) {
    cmdId += 1;
    writeNodeValue("CmdId", cmdId, prefix);
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

  function getTagText(dom, name, required) {
    var elements = dom.getElementsByTagName(name), node;
    node = elements[0];
    if (node) {
      if (elements.length > 1) {
        log("Warning: More than one element of type " + name + " in " + printNode(dom) + ". Only first element processed.");
      }

      return node.childNodes[0].nodeValue; //return containing text
    } else if (required) {
      throw ({name: "SyntaxError", message: "Could not find node with name " + name + " in " + printNode(dom)});
    }
  }

  //helper function to parse header values into this message:
  function readHeader(hdr) {
    var header = {
        sessionId:  getTagText(hdr, "SessionID", true),
        msgId:      getTagText(hdr, "MsgID", true),
        url:        getTagText(hdr, "RespURI"),
        maxMsgSize: getTagText(hdr, "MaxMsgSize")
      };
    //As I see there are not really more header fields we need to understand.

    return header;
  }

  function readMeta(node) {
    var tmp, meta = {};

    tmp = node.getElementsByTagName("Anchor")[0];
    if (tmp) {
      meta.anchor = { Last: getTagText(tmp, "Last"), Next: getTagText(tmp, "Next", true)};
    }

    meta.format = getTagText(node, "Format");

    meta.type = getTagText(node, "Type");
    meta.maxMsgSize = getTagText(node, "MaxMsgSize");
    //ignoring all the memory stuff, can't handle that anyways. See if I can react to maxMsgSize.. :(
  }

  //helper function to add meta to msg
  function addMetaToMsg(meta, prefix) {
    m.push(prefix); m.push("<Meta>\n");
    var nprefix = prefix + "\t";
    if (meta.anchor) {
      m.push(nprefix); m.push("<Anchor xmlns='syncml:metinf'>\n");
      if (meta.last) {
        writeNodeValue("Last", meta.last, nprefix + "\t", true);
      }
      writeNodeValue("Next", meta.next, nprefix + "\t", true);
    }
    if (meta.format) {
      writeNodeValue("Format", meta.format, nprefix + "\t", true);
    }
    if (meta.type) {
      writeNodeValue("Type", meta.type, nprefix + "\t", true);
    }
    if (meta.maxMsgSize) {
      writeNodeValue("MaxMsgSize", meta.maxMsgSize, nprefix + "\t", true);
    }
    m.push(prefix); m.push("</Meta>\n");
  }

  //helper function to parse items
  function readItem(node) {
    var child, item = {};

    //may have: Target, Source, Meta, Data. Not supported by me: SourceParent, TargetPartent :)
    child = node.firstChild;
    while (child) {
      switch (child.nodeName) {
      case "Data":
        item.data = child.nodeValue;
        break;
      case "Source":
        item.source = getTagText(child, "LocURI", true);
        break;
      case "Target":
        item.target = getTagText(child, "LocURI", true);
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
      addMetaToMsg(item.meta, prefix);
    }
    if (item.data) {
      writeNodeValue("Data", item.data, nprefix);
    }
    m.push(prefix); m.push("</Item>\n");
  }

  //helper function to parse alerts
  function readAlert(node) {
    var items, alert = {};
    alert.msgId = header.msgId;
    alert.cmdId = getTagText(node, "CmdID", true);
    alert.data  = getTagText(node, "Data", true);
    items = node.getElementsByTagName("Item");
    if (items && items.length > 0) {
      if (items.length !== 1) {
        log("More than one item in Alert. Can't handle that yet: " + printNode(node));
      }
      alert.item = readItem(items[0]); //this should contain source and target and meta with last/next anchor for sync-alerts.
    }

    return alert;
  }

  //helper function to add alert to msg:
  function addAlertToMsg(alert, prefix) {
    var i, nprefix;
    m.push(prefix); m.push("<Alert>\n");
    nprefix = prefix + "\t";
    writeCmdId(nprefix);
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
    var status = { items: []}, items, item, i;

    status.cmdId = getTagText(node, "CmdID", true);
    status.msgRef = getTagText(node, "MsgRef", true);
    status.cmdRef = getTagText(node, "CmdRef", true);
    status.cmdName = getTagText(node, "Cmd"); //not really necessary
    status.targetRef = getTagText(node, "TargetRef"); //could be 0 or more. Can't handle more, yet.
    status.sourceRef = getTagText(node, "SourceRef"); // same as targetRef. See if more than one happens. 
                                                     // Meaning is, that the status could affect multiple destinations at once...
                                                     // I did not see a server that uses that, yet. 
    status.cred = getTagText(node, "Cred");
    status.chal = getTagText(node, "Chal");
    status.data = getTagText(node, "Data", true); //the return code. This is the most important bit. :)

    items = node.getElementsByTagName("Item"); //more information for the command..
    for (i = 0; i < items.length; i += 1) {
      item = readItem(items[i]);
      if (item) {
        status.items.push_back(item);
      }
    }

    return status;
  }

  //helper function to add a status to the msg.
  function addStatusToMsg(status, prefix) {
    var i, nprefix;
    m.push(prefix); m.push("<Status>\n");
    nprefix = prefix + "\t";
    writeCmdId(nprefix);
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

  //helper function to add a syncCmd to the msg.
  function addSyncCmdToMsg(cmd, prefix) {
    var i;
    writeCmdId(prefix);
    for (i = 0; i < cmd.items.length; i += 1) {
      addItemToMsg(cmd.items[i], prefix);
    }
  }

  //helper function to parse add/replace commands
  function readAddReplace(node) {
    var obj = { items: []}, meta, items, i;
    //ignoring NoResp, Cred.
    obj.cmdId = getTagText(node, "CmdID", true);
    meta = node.getElementsByTagName("Meta")[0];
    if (meta) {
      obj.meta = readMeta(meta);
    }
    items = node.getElementsByTagName("Item");
    for (i = 0; i < items.length; i += 1) {
      obj.items.push_back(readItem(items[i]));
    }
    return obj;
  }

  function readDelete(node) {
    //igrnoring SftDelete and Archive.
    return readAddReplace(node);
  }

  //helper function to add sync to the msg:
  function addSyncToMsg(sync, prefix) {
    var i, nprefix;
    m.push(prefix); m.push("<Sync>\n");
    nprefix = prefix + "\t";
    writeCmdId(nprefix);
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
  }

  //helper function to parse sync:
  function readSync(node) {
    var child, obj, sync = {add: [], del: [], replace: []};

    child = node.firstChid;
    while (child) {
      switch (child.nodeName) {
      case "Add":
        obj = readAddReplace(child);
        if (obj) {
          sync.add.push_back(obj);
        }
        break;
      case "Replace":
        obj = readAddReplace(child);
        if (obj) {
          sync.replace.push_back(obj);
        }
        break;
      case "Delete":
        obj = readDelete(child);
        if (obj) {
          sync.del.push_back(obj);
        }
        break;
      case "CmdID":
        sync.cmdId = child.nodeValue;
        break;
      case "NumberOfChanges":
        sync.numberOfChanges = child.nodeValue;
        break;
      case "Target":
        sync.target = getTagText(child, "LocURI", true);
        break;
      case "Source":
        sync.source = getTagText(child, "LocURI", true);
        break;
      default: //ignore: NoResp, Cred, Meta and Atomic, Copy, Move, Sequence.
        log("Unexpected node type (" + child.nodeName + ") in sync received: " + printNode(node));
        break;
      }

      child = node.nextSibling;
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
      switch (node.nodeName) {
      case "Alert":
        obj = readAlert(node);
        if (obj) {
          bodyObj.alerts.push_back(obj);
        }
        break;
      case "Status":
        obj = readStatus(node);
        if (obj) {
          if (!bodyObj.status[obj.msgRef]) {
            bodyObj.status[obj.msgRef] = [];
          }
          bodyObj.status[obj.msgRef][obj.cmdRef] = obj;
        }
        break;
      case "Sync":
        obj = readSync(node);
        if (obj) {
          bodyObj.sync.push_back(obj);
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
      var msgRef, cmdRef, i;

      //check parameters:
      if (typeof sessionInfo.sessionId !== 'number' || typeof sessionInfo.msgId !== 'number') {
        throw ({name: "InvalidParamters", message: "You need to specify sessionId and msgId as number-members of sessionInfo parameter." + JSON.stringify(sessionInfo) });
      }
      if (typeof sessionInfo.target !== 'string' || typeof sessionInfo.source !== 'string') {
        throw ({name: "InvalidParamters", message: "You need to specify target and source as string-members of sessionInfo parameter." + JSON.stringify(sessionInfo) });
      }

      m = [];
      m.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
      m.push("<SyncML>\n");

      //sync hdr:
      m.push("\t<SyncHdr><VerDTD>1.2</VerDTD><VerProto>SyncML/1.2</VerProto>\n"); //init header
      writeNodeValue("SessionID", sessionInfo.sessionId, "\t\t");
      writeNodeValue("MsgID", sessionInfo.msgId, "\t\t");
      addTargetSource(sessionInfo, "\t\t"); //source and target paths. Source = on device, target = on server.
      //add optional credentials:
      addCredentialsToHeader(sessionInfo);
      m.push("</SyncHdr>");

      //body:
      m.push("<SyncBody>\n");

      //first add status responses:
      for (msgRef in body.status) {
        if (body.status.hasOwnProperty(msgRef)) {
          for (cmdRef in body.status[msgRef]) {
            if (body.status[msgRef].hasOwnProperty(cmdRef)) {
              addStatusToMsg(body.status[msgRef][cmdRef], "\t");
            }
          }
        }
      }

      //add alerts: 
      for (i = 0; i < body.alerts.length; i += 1) {
        addAlertToMsg(body.alerts[i], "\t");
      }

      //add syncCmd:
      for (i = 0; i < body.sync.length; i += 1) {
        addSyncToMsg(body.sync[i], "\t");
      }

      if (body.isFinal) {
        m.push("<Final></Final>\n");
      }
      m.push("</SyncBody>\n");

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

      //parse body:
      bodyXML = responseDOM.getElementsByTagName("SyncBody")[0];
      if (bodyXML) {
        body = readBody(bodyXML);
      } else {
        throw ({name: "SyntaxError", message: "Coult not read SyncBody of response " + xml});
      }
    },

    matchCommandsFromMessage: function (oldMessage) {
      //matches the statuses in the current message to the commands in the old message 
      //and returns a set of commands that failed.
      //TODO: implement!

      return [];
    },

    addStatuses: function (cmds) {
      //adds status 200 value for a set of commands to the current message.

      //TODO: implement.
    },

    addAlert: function (alert) {
      //adds a alert - cmd to the message. Params: Alert Code, optional item, meta, source / target ... 

      //TODO: implement.
    },

    //only one syncCmd is currently supported. Will add every cmds here to this first syncCmd.
    addSyncCmd: function (cmd) {
      //adds add / replace /delete to the sync cmd of the message. 
      //need to give type (add/replace/delete), and the item,

      if (cmd.type !== "add" && cmd.type !== "del" && cmd.type !== "replace") {
        throw ({ name: "Invalid Parameters", message: "type needs to be add, del or replace." });
      }

      //TODO: items und meta irgendwie überlegen.
      var obj = {
          items: [cmd.item],
          cmdId: getCmdId(),
          meta: cmd.meta
        };

      body.sync[0][cmd.type].push_back(obj);
    }
  };
};
