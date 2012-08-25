//JSLint options:
/*global AjaxCall, log, logToApp, logError_lib, syncMLMessage, Base64, setTimeout, ajaxCallPost */

"use strict";
var SyncMLModes = {
    "two-way":             "200", // TWO-WAY Specifies a client-initiated, two-way synchronization. 
    "slow":                "201", // SLOW SYNC Specifies a client-initiated, two-way slow-synchronization. 
    "one-way-from-client": "202", // ONE-WAY FROM CLIENT Specifies the client-initiated, one-way only synchronization from the client to the server. 
    "refresh-from-client": "203", // REFRESH FROM CLIENT Specifies the client-initiated, refresh operation for the oneway only synchronization from the client to the server. 
    "one-way-from-server": "204", // ONE-WAY FROM SERVER Specifies the client-initiated, one-way only synchronization from the server to the client. 
    "refresh-from-server": "205" // REFRESH FROM SERVER Specifies the client-initiated, refresh operation of the one-way only synchronization from the server to the client. 
  };

//Other SyncML Alert Codes:
//https://core.forge.funambol.org/wiki/SyncMLAlertCodes
var SyncMLAlertCodes = {
    "100": "show", //data should be shown to client.
    //client-initiated sync modes:
    "200": "two-way",
    "201": "slow",
    "202": "one-way-from-client",
    "203": "refresh-from-client",
    "204": "one-way-from-server",
    "205": "refresh-from-server",
    //server-initiated sync modes:
    "206": "two-way-by-server",
    "207": "one-way-from-client-by-server",
    "208": "refresh-from-client-by-server",
    "209": "one-way-from-server-by-server",
    "210": "refresh-from-server-by-server",
    //misc:
    "221": "result-alert", //requests sync results
    "222": "next-message", //requests next message
    "223": "no-end-of-data", //end of data not received => message missing? Syntax error?
    "224": "suspend", //suspend sync session
    "225": "resume"  // resume sync session
  };

//some more or less static device infos.
var DeviceProperties = {
    man: "WebOSMoboSync",
    mod: "", 
    oem: "MoboSync",
    fwv: "20.11.2011", //set firmware version to today.
    swv: "0.1.1", //set to full platform version.. that could help to work out vcard interpretation issues.
    hwv: "20.11.2011", //set hardware version to today, too.. doesn't really care.
    devID: undefined, //fill that from the account!
    devType: "smartphone", //say smartphone here. Also the tablet is "similar to a phone".. ;)

    id: undefined, //needs id.

    maxMsgSize: 16 * 1024
  };

//Sync works this way:
// 1. send msg with credentials in header and alert for syncmode
// 2. receive response, which hopefully accepts creds and syncmode (as status elements) and also has an alert with syncmode and target/source.
// 3. Gather data, send own sync command with add/replace/delete commands.
// 4. Receive Status for that. 
// 5. Reply with Alert 222 => Next msg. Maybe that is a speciality of egroupware... As I see it the command could also be in the status msg...
// 6. Receive a sync command and parse the contents of the sync command, which should be add/replace/delete commands
// 7. Fulfill the commands, send a status element (with correct CmdRef!) for each command. => 200 = ok.
// 8. For all Add commands build a map with mapitems where target is id on server and source is new id on device.
// 9. Send this message.

//function passing: sync => sendSyncInitializationMsg => parseInitResponse => getSyncData => (external methods to get data) => 
//    continueSyncCalendar/Contacts => parseSyncResponse => itemActionCalendar/ContactsCallback => parseLastResponse => callback :)
// one problem remains: make contacts/calendar nicer and more uniform.. :( make it much easier to add more datastores.

var MimeTypes = {
    calendar: { pref: "text/calendar", fallback: "text/x-vcalendar" },
    contacts: { pref: "text/vcard", fallback: "text/x-vcard"}
};

var SyncML = (function () {      //lastMsg allways is the last response from the server, nextMsg allways is the message that we are currently building to send.
  var sessionInfo, account = {}, lastMsg, nextMsg, dsIndex = 0,
  //callbacks to get event / contacts data as iCal / vCard strings.
  //will all receive a callback function as parameter, that is to be called with "false" in the case of errors.
  //otherwise it needs to be supplied to the called sync function!
  //data needs to be of form { data = whole data in vcard/ iCal string, localId = id on device } 
    //callback names:
      //needs to get all calendar data and call callback with { replace: [ all data here ] }, callback
      //getAllData: function () { throw ({name: "LogicError", message: "Need to set calendar.getAllData callback to something."}); },
      //needs to get only new calendar data and call callback with { replace: [modified], add: [new], del: [deleted] }, callback
      //getNewData: function () { throw ({name: "LogicError", message: "Need to set calendar.getNewData callback to something."}); },
      //this will be called on refresh from server to delete all local data. Call callback with {}.
      //deleteAllData: function () { throw ({name: "LogicError", message: "Need to set calendar.deleteAllData callback to something."}); },
      //Param: {type: add, callback, globalId: ..., item: new item data }. call callback with {type: add, globalId: ..., localId: ... success: true/false }
      //newEntry: function () { throw ({name: "LogicError", message: "Need to set calendar.newEntry callback to something."}); },
      //Param: {type: replace, callback, localId: ..., item: new data }. Call callback with { type: replace, globalId: ..., localId: ... success: true/false }.
      //updateEntry: function () { throw ({name: "LogicError", message: "Need to set calendar.updateEntry callback to something."}); },
      //Param: { type: del, callback, localId: ... }. Call callback with { type: del, globalId: ..., localId: ... success: true/false }. 
      //delEntry: function () { throw ({name: "LogicError", message: "Need to set calendar.delEntry callback to something."}); },
      //status variables:
    dsNames = ["calendar", "contacts"], dsTypes = [MimeTypes.calendar.pref, MimeTypes.contacts.pref],
    types = ["add", "del", "replace"], willBeSynced = [],
    secondTry = false,
    resultCallback, parseSyncResponse,
    msgQueue = []; //for multiple sync messages. Don't run into last-msg-cycle if there are messages in here.

  //private members & methods:
  sessionInfo = {
    sessionId: new Date().getTime(),
    msgId: 0,
    error: null,
    url: ''
  };

  //returns a msgId for a new message: 
  function getMsgId() {
    sessionInfo.msgId += 1;
    return sessionInfo.msgId;
  }

  //sends a message to the server.
  function sendToServer(msg, callback, retry, id) {
    var text, retrySend, checkTimeout, received = false, lastSend, future;
    retrySend = function (e) {
      if (retry <= 5) {
        log("Got " + e.name + ": " + e.message + ". Retrying (" + retry + ")");
        log("Complete exception: " + JSON.stringify(e));
        logToApp("Got " + e.name + ": " + e.message + ". Retrying (" + retry + ")");
        sendToServer(msg, callback, retry + 1, id);
        lastSend = Date.now();
      } else {
        logError_lib({name: "ConnectionError", message: "No connection to server, even after retries."});
      }
    };
    checkTimeout = function() {
      var now;
      if (!received) {
        now = Date.now();
        log ("Message " + id + " was send last before " + ((now - lastSend) / 1000) + " seconds, was not yet received.");
        if (now - lastSend > 60*1000) { //last send before one minute?
          if (retry <= 5) {
            setTimeout(checkTimeout, 1000);
          } else {
            log("Already tried 5 times. Seems as if server won't answer? Sync seems broken.");
          }
          retrySend({name:"Timeout", message:"Got no response in one minute."});
        }
      } else {
        log ("Message " + id + " received, returning.");
      }
    };
    try {
      if (!retry) {
        retry = 0;
        id = getMsgId();
      }
      if (lastMsg) {
        msg.addStatuses(lastMsg);
      }
      text = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: id, target: account.url, source: DeviceProperties.id});
      log("Sending to server: " + text);
      nextMsg = msg; //just in case. :)
      future = ajaxCallPost(sessionInfo.url, text, 
          { "bodyEncoding":"utf8" , 
        "headers": {"Content-Type":"application/vnd.syncml+xml", "Content-Length": text.length} } );
      lastSend = Date.now();
      setTimeout(checkTimeout, 1000);
      future.then(this, function(f) {
        try {        
          if (f.result && f.result.status === 200) {
            log("Status of message: " + f.result.status);
            log("Request succeeded, Got: ");
            log(f.result.responseText);
            if (f.result.responseText === "") {
              retrySend({name:"ConnectionError", message:"Got empty response, this indicates connection problem."});
            } else {
              received = true;
              callback(f.result.responseText);
            }
          } else { //request failure!
            log("Request failed");
            var error;
            if (f.result) {
              error = f.result.status;
            } 
            if (!error) {
              error = JSON.strinfigy(f.exception);
            }
            if (f.result) {
              log(JSON.stringify(f.result));
            }
            if (f.exception) {
              log(JSON.stringify(f.exception));
            }
            retrySend({name: "ConnectionError", message: "No connection to server."});
          }
        } catch (e) {
          //logError_lib(e); don't fail here, let retry mechanism work.
          retrySend(e);
        }
      });
      future.onError(function (f) {
        log("Error in SendMessage future: " + JSON.stringify(f.exeption));
        logToApp("Connection to server failed: " + JSON.stringify(f.exeption));
        future.result = { returnValue: false };
      });
    } catch (error) {
      retrySend(error);
    }
  }

  function putDevInfo(msg, datastores, cmd) {
    msg.addPutDevInfo(DeviceProperties, datastores, cmd);
  }

  function generalParseMsg(text) {
    var i, j, k, failed, cmd, datastores, source, types, type, ds;
    try {
      lastMsg = syncMLMessage();
      /*i = 1;
      while (i < 300) {
        log("Char(" + i + "): " + text.charAt(i) + " = " + text.charCodeAt(i));
        i += 1;
      }
      return [ {cmd: {}, status: {}}];*/
      //log("trying to parse msg...");
      lastMsg.buildMessageFromResponse(text);
      //parse failed things here:
      failed = lastMsg.matchCommandsFromMessage(nextMsg);
      if (failed && failed.length > 0) { //debug output.
        log("Have " + failed.length + " failed commands: ");
        for (i = 0; i < failed.length; i += 1) {
          if ((failed[i].cmd.type === "Put" || failed[i].cmd.type === "Results") && failed[i].status.data === "501") {
            log("Server does not support put dev info, ignore.");
            failed.splice(i, 1);
            i -= 1;
          } else if (failed[i].status.cmdRef === "0") {
            log("Credentials not accepted by server. Can't sync! Please check credentials and try again.");
            logToApp("Credentials not accepted by server. Can't sync! Please check credentials and try again.");
            resultCallback({success: false});
          } else {
            if (failed[i].status && failed[i].status.data === "406") {
              logToApp("Warning: Server said to not support optional command " + JSON.stringify(failed[i]));
              failed.splice(i, 1);
              i -= 1;
            } else {
              log(JSON.stringify(failed[i]));
            }
          }
        }
      }
      nextMsg = syncMLMessage();
      nextMsg.addCredentials(account);
      if (lastMsg.getHeader().respURI) {
        sessionInfo.url = lastMsg.getHeader().respURI;
        log("Got new response URI " + sessionInfo.url);
      }
      
      //if the map command got acknowledged, we can delete the old map...
      //log("got " + lastMsg.getBody().status.length + " stati in other msg.");
      try {
        for (i in lastMsg.getBody().status) {
          if (lastMsg.getBody().status.hasOwnProperty(i)) {
            for (j in lastMsg.getBody().status[i]) {
              if (lastMsg.getBody().status[i].hasOwnProperty(j)) {
                cmd = lastMsg.getBody().status[i][j];
                if (cmd.cmdName === "Map") {
                  log("Got map status");
                  if (cmd.data === "200") {
                    log("Map cmd was ok. DS: " + cmd.sourceRef);
                    ds = account.datastores[cmd.sourceRef];
                    if (ds) {
                      log("Deleting old mapping.");
                      delete ds.oldMapping;
                    }
                  } else {
                    log("Map command failed: " + cmd.data);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        log("Other msg had no status? " + JSON.stringify(e));
      }
      
      //server may ask for device info, answer to that: 
      for (i = 0; i < lastMsg.getBody().cmds.length; i += 1) {
        cmd = lastMsg.getBody().cmds[i];
        if (cmd.type === "Get" &&
            cmd.items &&
            cmd.items[0] &&
            cmd.items[0].target === "./devinf12") {
          log("Server requested dev info, put it into next msg.");
          cmd.msgId = lastMsg.getHeader().msgId;
          cmd.type = "Results";
          putDevInfo(nextMsg, undefined, cmd);
        //end of Get
        } else if ((cmd.type === "Results" || cmd.type === "Put") && cmd.items && cmd.items[0] && cmd.items[0].source === "./devinf12") {
          log("Got devInfo from server.");
          if (typeof cmd.items[0].data === "object") {
            datastores = cmd.items[0].data.getElementsByTagName("DataStore");
            for (j = 0; j < datastores.length; j += 1) {
              source = datastores.item(j).getElementsByTagName("SourceRef").item(0).firstChild.nodeValue;
              types = datastores.item(j).getElementsByTagName("CTType");
              log("Got " + types.length + " types from server for " + source + ".");
              for (k = 0; k < types.length; k += 1) {
                type = types.item(k).firstChild.nodeValue;
                log("Testing type " + type);
                if (type !== MimeTypes.calendar.pref && type !== MimeTypes.contacts.pref) {
                  log("Skipping type " + type + ".");
                  type = undefined;
                } else {
                  break;
                }
              }
              if (type === undefined) {
                log("Preferred type not found, testing fallback.");
                for (k = 0; k < types.length; k += 1) {
                  type = types.item(k).firstChild.nodeValue;
                  log("Testing type " + type);
                  if (type !== MimeTypes.calendar.pref && type !== MimeTypes.calendar.fallback && 
                      type !== MimeTypes.contacts.pref && type !== MimeTypes.contacts.fallback) {
                    log("Don't support type " + type + " right now. Please report back with log file.");
                    type = undefined;
                  } else {
                    break;
                  }
                }
              }
              log("Datastore: " + source);
              log("Type: " + type);
              for (k in account.datastores) {
                if (account.datastores.hasOwnProperty(k)) {
                  if (account.datastores[k].path === source) {
                    log("Setting type for datastore " + k);
                    account.datastores[k].serverType = type;
                    if (cmd.items[0].data.getElementsByTagName("DevID").item(0)) {
                      account.datastores[k].serverId = cmd.items[0].data.getElementsByTagName("DevID").item(0).firstChild.nodeValue;
                      log("Stored serverId: " + account.datastores[k].serverId);
                    }
                  } else {
                    log(k + " is not the right datastore");
                  }
                }
              } //account.datastores.loop
            } //datastores loop
          }
        } //end of results cmd.
      }
      return failed;
    } catch (e1) {
      logToApp(e1.name + " during message parsing: " + e1.message);
      log("Error in generalParseMsg:");
      log(JSON.stringify(e1));
    }
    return [];
  }

  function parseLastResponse(responseText, direct) {
    var failed, i;
    try {
      if (!direct) {
        failed = generalParseMsg(responseText);
        if (failed && failed.length > 0) {
          log("Have " + failed.length + " failed commands: ");
          for (i = 0; i < failed.length; i += 1) {
            log(JSON.stringify(failed[i]));
          }
          resultCallback({success: false});
          return;
        }
      }
      for (i = 0; i < willBeSynced.length; i += 1) {
        if (account.datastores[willBeSynced[i]]) {
          account.datastores[willBeSynced[i]].state = "finished";
        }
      }
      //sync finished successful! :)
      log("All ok. Finished sync, call last callback.");
      logToApp("Got last message and parsed it, sync was successful.");
      resultCallback({success: true, account: account }); //return account to update next / last sync. Mode might also be set by server. Nothing else should have changed.
    } catch (e) {
      logError_lib(e);
    }
  }

  function itemActionCallback(result) {
    var item, message, ds, cbsRunning, i;
    try {
      ds = account.datastores[result.name];
      if (result && result.success) {
        log("item action success");
        ds[result.type] -= 1;
        if (result.type === "add") {
          //get cmd item from last message to get the globalId for the mapping cmd.
          item = lastMsg.getBody().sync[result.globalId.sync][result.type][result.globalId.cmd].items[result.globalId.item];
          if (result.localId) {
            ds.mapping.push({source: result.localId, target: item.source});
            item.status = 200;
            log("Added id to mapping");
          } else {
            log("No id for added item => failure");
            item.status = 510;
          }
        }
      } else if (result && result.success === false) {
        log("item action failure");
        ds[result.type] -= 1;
        //lastMsg.getBody().sync[result.globalId.sync][result.type][result.globalId.cmd].status = 510; //remember that this was a failure. Fail the whole command if any item fails.
        lastMsg.getBody().sync[result.globalId.sync][result.type][result.globalId.cmd].items[result.globalId.item].status = 510;
        log("noted failure for status cmd.");
      }

      cbsRunning = 0;
      for (i = 0; i < willBeSynced.length; i += 1) {
        ds = account.datastores[willBeSynced[i]];
        cbsRunning += ds.add + ds.del + ds.replace;
      }
      log("Have " + cbsRunning + " callbacks left");
      if (cbsRunning === 0) { //all callbacks finished:
        log("all change callbacks finished.");
        if (msgQueue.length > 0) {
          message = msgQueue.shift(); //get first queued message.
        } else {
          message = nextMsg;
        }
        //add mappings to msg.
        for (i = 0; i < willBeSynced.length; i += 1) {
          ds = account.datastores[willBeSynced[i]];
          if (ds.oldMapping) {
            ds.mapping = ds.oldMapping.concat(ds.mapping);
          }
          message.addMap({source: ds.name, target: ds.path, mapItems: ds.mapping });
          if (ds.mapping.length === 0 && msgQueue.length === 0 && (!message.getBody().sync || message.getBody().sync.length === 0)) {
            log("message is empty => add alert 222"); //this might happen to often or even to few times... hm.
            message.addAlert({ data: "222", items: [ { source: ds.name, target: ds.path } ] });
            log("add alert ok");
          }
          ds.state = "sendMapping";
          ds.oldMapping = ds.mapping;
          ds.mapping = [];
        }

        log("lastMsg.isFinal = " + lastMsg.isFinal() + " msgQueue: " + msgQueue.length);
        if (lastMsg.isFinal() && msgQueue.length === 0) {
          if (dsIndex < willBeSynced.length) {
            log("Sync of current datastore finished, sync next one");
            getSyncData();
          } else {
            logToApp("Last message send to server.");
            sendToServer(message, parseLastResponse);
          }
        } else {
          logToApp("Sending sync cmd/response to server, more data will transmitted.");
          log("Not final message. there will be more.");
          sendToServer(message, parseSyncResponse); //continue sync.
        }
      }
      log("Not finished, yet");
    } catch (e) {
      logError_lib(e);
    }
  }

  //will need to see if any updates failed.
  //then the message will have changes from the server, that need to be processed.
  //in the end a new message containing mapings from local to global ids for new items 
  //needs to be generated and send.
  //remark: we don't check item type anywhere.. this would be the right place.
  parseSyncResponse = function (responseText) {
    var lastOwn, failed, i, j, k, sync, callbacks = ["newEntry", "delEntry", "updateEntry"], ti, item, cmd, realFailure, ds, waitingSync, cmdName;
    try {
      lastOwn = nextMsg;
      failed = generalParseMsg(responseText);
      if (failed && failed.length > 0) {
        log("Have " + failed.length + " failed commands: ");
        realFailure = false;
        for (i = 0; i < failed.length; i += 1) {
          if (failed[i].status.data === "207") {
            log("Conflict resolved on server side with merge, replace command will follow. Own cmd was: " + JSON.stringify(failed[i].cmd));
            logToApp("Conflict resolved on server side with merge: " + JSON.stringify(failed[i].cmd.items[0].data));
          } else if (failed[i].status.data === "209") {
            log("Conflict resolved on server side with duplicate, add command will follow. Own cmd was: " + JSON.stringify(failed[i].cmd));
            logToApp("Conflict resolved on server side with duplicate: " + JSON.stringify(failed[i].cmd.items[0].data));
          } else if (failed[i].status.data === "419") {
            log("Conflict resolved on server side with server data. Own cmd and status: " + JSON.stringify(failed[i]));
            logToApp("Conflict resolved on server side with server data: " + JSON.stringify(failed[i].cmd.items[0].data));
          } else {
            cmdName = failed[i].status.cmd;
            if (!cmdName) {
              cmdName = failed[i].status.cmdName;
            }
            if (cmdName === "Replace" || cmdName === "Add" || cmdName === "Delete") {
              logToApp(cmdName + " of " + failed[i].cmd.items[0].data + " failed with " + failed[i].status.data);
              log("failed: " + JSON.stringify(failed[i]));
            } else {
              realFailure = true;
              logToApp("Command failed: " + cmdName + " error " + failed[i].status.data);
              log("failed: " + JSON.stringify(failed[i]));
            }
          }
        }
        if (realFailure) {
          resultCallback({success: false});
          return;
        }
      }
      log("Status-Cmds processed. No failures.");
      if (lastOwn.isFinal() && msgQueue.length === 0 &&                       //only if our last msg was out and we answered to all status replies try to get more from server.
          (!lastMsg.getBody().sync || lastMsg.getBody().sync.length === 0)) {     //if we are meant to get something from server! :)
        log("Did not receive a sync cmd.");
        for (i = 0; i < willBeSynced.length; i += 1) {
          if (account.datastores[willBeSynced[i]] &&
              account.datastores[willBeSynced[i]].method !== "one-way-from-client" &&
              account.datastores[willBeSynced[i]].method !== "refresh-from-client") {
            account.datastores[willBeSynced[i]].state = "waitingSyncCmd";
            waitingSync = true;
          }
        }
        if (waitingSync) {
          if (!secondTry) {
            secondTry = true;
            log("Try to get next msg command.");
            for (i = 0; i < willBeSynced.length; i += 1) {
              if (account.datastores[willBeSynced[i]]) {
                nextMsg.addAlert({ data: "222", items: [ { source: willBeSynced[i], target: account.datastores[willBeSynced[i]].path } ] });
              }
            }
            logToApp("No sync command in msg, trying to trigger it with get next message command.");
            sendToServer(nextMsg, parseSyncResponse);
            return;
          } else {
            log("Already had second try, something failed.");
            logToApp("Server did not send a sync command, no data from server receiver.");
            resultCallback({success: false});
            return;
          }
        } else {
          if (dsIndex < willBeSynced.length) {
            log("Start sync of next datastore.");
            getSyncData();
          } else {
            log("All sync cmds finished. => sync finished.");
            logToApp("All sync cmds processed, sync finished.");
            parseLastResponse("", true);
          }
          return;
        }
      }
      secondTry = false;

      //server will answer with sync-command(s) that contains server changes:
      for (i = 0; lastMsg.getBody().sync && i < lastMsg.getBody().sync.length; i += 1) {
        log("Processing sync " + (i + 1) + " of " + lastMsg.getBody().sync.length + " syncs.");
        sync = lastMsg.getBody().sync[i];
        ds = account.datastores[sync.target];

        for (ti = 0; ti < types.length; ti += 1) {
          for (j = 0; sync[types[ti]] && j < sync[types[ti]].length; j += 1) {
            cmd = sync[types[ti]][j];
            for (k = 0; k < cmd.items.length; k += 1) {
              ds[types[ti]] += 1;
              item = undefined;
              if (types[ti] !== "del") {
                item = cmd.items[k].data;
                if (cmd.items[k].format === "b64") {
                  item = Base64.decode(item); //CDATA needs to be removed in SyncMLMessage.
                }
              }
              setTimeout(ds[callbacks[ti]].bind(this,
                {
                  type: types[ti],
                  callback: itemActionCallback,
                  localId: cmd.items[k].target,
                  globalId: {sync: i, item: k, cmd: j, cmdId: cmd.cmdId }, //abuse cmdId to get globalId later and find status better later. :)
                  item: item,
                  name: ds.name,
                  serverData: ds,
                  account: account
                }), 100);
            }
          }
        }
        ds.state = "processingData";
      } //sync cmd processing.
      log("Parsing of sync response finished.");
      logToApp("Sync cmd parsed, now processing data.");
      itemActionCallback({}); //in case there was no action to be done, continue with sync by calling itemActionCallback.
    } catch (e) {
      logError_lib(e);
    }
  };

  function mContinueSync(name, data) {
    var addedItems = 0, ti = 0, i, obj, type;
    //TODO: what happens if this is called two times with different data objects?
    try {
      if (!data.success) {
        resultCallback({success: false});
        return;
      }
      for (ti = 0; ti < types.length; ti += 1) {
        for (i = 0; data[types[ti]] && i < data[types[ti]].length; i += 1) {
          obj = data[types[ti]][i];
          type = types[ti];
          if (account.datastores[name].method === "slow" && type === "replace") { //make sure that we send only adds on slow sync.
            type = "add";
          }
          nextMsg.addSyncCmd({
            type: type,
            item: {
              data:  obj.data ? "<![CDATA[" + Base64.encode(obj.data) + "]]>" : undefined,
              source: obj.localId,
              //target: obj.uid,
              meta: {
                type: account.datastores[name].serverType ? account.datastores[name].serverType : account.datastores[name].type,
                format: "b64" //do we want b64? First try without, maybe.. easier to debug.
              }
            }
          });
          account.datastores[name][types[ti] + "Own"] += 1;
          addedItems += 1;
          if (addedItems >= 9) { //TODO: make this more dynamic as reaction to server.
            addedItems = 0;
            //tell server that this won't be the last msg.
            nextMsg.setFinal(false);
            //we need to send sync command to initialize sync, even if we don't have data.
            //initialize target / source for sync cmd.
            nextMsg.setSyncTargetSource({ source: name, target: account.datastores[name].path });
            msgQueue.push(nextMsg);
            nextMsg = syncMLMessage(); //get new message!
            nextMsg.addCredentials(account);
          }
        }
      }

      if (addedItems === 0 && msgQueue.length > 0) { //last msg was empty. get back the last msg of the queue if there is one.
        nextMsg = msgQueue.pop();
      }

      //store last msg in queue.
      nextMsg.setFinal(true);
      //we need to send sync command to initialize sync, even if we don't have data.
      //initialize target / source for sync cmd.
      nextMsg.setSyncTargetSource({ source: name, target: account.datastores[name].path });
      msgQueue.push(nextMsg);

      nextMsg = msgQueue.shift(); //get FIRST message from queue.
      logToApp("Sending first sync cmd to server.");
      sendToServer(nextMsg, parseSyncResponse);
      account.datastores[name].state = "waitingForSyncResponse";
    } catch (e) {
      logError_lib(e);
    }
  }

  //this will try to get all changes from the device.
  //TODO: this most probably won't work if calendar and contacts are enabled, because two asynchronous functions are called and not synchronized again. 
  //need to handle that where I build the next message to the server.
  function getSyncData() {
    var i, method;
    try {
      i = dsIndex;
      dsIndex += 1;
      if (i < willBeSynced.length) {
        if (account.datastores[willBeSynced[i]]) {
          log("ServerIdGetSyncData: " + account.datastores[willBeSynced[i]].serverId);
          method = account.datastores[willBeSynced[i]].method;
          if (method === "slow" || method === "refresh-from-client") {
            log("Getting all data, because of slow sync or refresh from client.");
            account.datastores[willBeSynced[i]].getAllData({callback: mContinueSync.bind(null, willBeSynced[i]), serverData: account.datastores[willBeSynced[i]], account: account});
            account.datastores[willBeSynced[i]].state = "gatheringAllData";
          } else if (method === "two-way" || method === "one-way-from-client") {
            log("Getting new data, because of two-way sync or one way from client.");
            account.datastores[willBeSynced[i]].getNewData({callback: mContinueSync.bind(null, willBeSynced[i]), serverData: account.datastores[willBeSynced[i]], account: account});
            account.datastores[willBeSynced[i]].state = "gatheringNewData";
          } else if (method === "refresh-from-server") {
            log("Deleting all data, because of refresh from server.");
            account.datastores[willBeSynced[i]].deleteAllData({callback: mContinueSync.bind(null, willBeSynced[i]), serverData: account.datastores[willBeSynced[i]], account: account});
            account.datastores[willBeSynced[i]].state = "deletingAllData";
          } else if (method === "one-way-from-server") {
            log("Don't get any calendar data, because of one way from server sync.");
            account.datastores[willBeSynced[i]].state = "receivingData";
            mContinueSync(willBeSynced[i], {success: true});
          } else {
            log("Unknown sync method: " + method);
            resultCallback({success: false});
          }
        }
      }
    } catch (e) {
      logError_lib(e);
    }
  }

  function parseInitResponse(responseText) {
    var failed, numProblems = 0, i, alert, needRefresh = false, syncAndMethod = [];
    try {
      failed = generalParseMsg(responseText);
      if (failed && failed.length > 0) {
        numProblems = failed.length;
        log("Have " + failed.length + " failed commands: ");
        for (i = 0; i < failed.length; i += 1) {
          log(JSON.stringify(failed[i]));
          if (failed[i].status.cmdName === "Alert" && failed[i].status.data === "508") { //server requires refresh.
            log("No problem, server just wants a refresh.");
            logToApp("Server requested slow sync.");
            needRefresh = true;
            numProblems -= 1;
          } else {
            logToApp("Cmd " + failed[i].status.cmd + " failed. Code: " + failed[i].status.data);
          }
        }
      }
      if (numProblems) {
        log(numProblems + " real problems left... break.");
        resultCallback({success: false});
        return;
      } else {
        //server will answer with sync-alerts, which might have a different sync mode, like slow for first sync:
        //TODO: maybe some other server will already send a sync cmd with data here?? See if that happens...
        willBeSynced = []; //empty willBeSynced.
        for (i = 0; i < lastMsg.getBody().alerts.length; i += 1) {
          alert = lastMsg.getBody().alerts[i];
          //log("Alert: " + JSON.stringify(alert));
          if (alert.items && alert.items[0]) {
            if (account.datastores[alert.items[0].target]) {
              if (alert.data) {
                log("Got " + alert.items[0].target + " method: " + alert.data);
                if (account.datastores[alert.items[0].target].method === "205" && alert.data === "201") {
                  log("Requested refresh from server, won't switch to slow sync.");
                } else {
                  account.datastores[alert.items[0].target].method = SyncMLAlertCodes[alert.data];
                }
                log("adding " + alert.items[0].target + " to will be synced.");
                willBeSynced.push(alert.items[0].target);
                syncAndMethod.push(alert.items[0].target + " method " + SyncMLAlertCodes[alert.data]);
                account.datastores[alert.items[0].target].state = "receivedInit";
                log("willbesynced: " + alert.items[0].target + " method " + SyncMLAlertCodes[alert.data]);
                needRefresh = false;
              }
              if (alert.items && alert.items[0] && alert.items[0].meta && alert.items[0].meta.anchor && alert.items[0].meta.anchor.last) {
                account.datastores[alert.items[0].target].serverLast = account.datastores[alert.items[0].target].serverNext;
                log("Got server-last: " + alert.items[0].meta.anchor.last + " and have own server-last: " + account.datastores[alert.items[0].target].serverLast);
                if (account.datastores[alert.items[0].target].serverLast !== alert.items[0].meta.anchor.last) {
                  log("Lasts do not match. Hopefully server told us to do slow sync.");
                }
              }
              if (alert.items && alert.items[0] && alert.items[0].meta && alert.items[0].meta.anchor && alert.items[0].meta.anchor.next) {
                log("Got next: " + alert.items[0].meta.anchor.next + " for server, save.");
                account.datastores[alert.items[0].target].serverNext = alert.items[0].meta.anchor.next;
              }
            }
          }
        }
        if (needRefresh) {
          logToApp("Could not find datastore for requested refresh.");
          log("Server told us that we need to refresh, but did not send a alert for that... fail. :(");
          resultCallback({success: false});
          return;
        }
        logToApp("Will sync " + JSON.stringify(syncAndMethod));
        getSyncData();
      }
    } catch (e) {
      logError_lib(e);
    }
  }

  function parseCredResponse(responseText) {
    var responseMsg, status;
    
    try {
      responseMsg = syncMLMessage();
      responseMsg.buildMessageFromResponse(responseText);
      status = responseMsg.getBody().status[sessionInfo.msgId]["0"].data; //status of last msg and header => allways 0. 
      if (status === "212" || status === "200") {
        log("Good credentials.");
        resultCallback({success: true});
      } else {
        log("Wrong credentials?, status data: " + status);
        resultCallback({success: false});
      }
    } catch (e) {
      logError_lib(e);
    }
  }

  //define public interface:
	return {
	  initialize: function (inAccount) {
	    var i, ds;
	    try {
	      if (inAccount.deviceName) {
	        DeviceProperties.mod = inAccount.deviceName;
	        log("Got deviceName: " + DeviceProperties.mod);
	      }
	      
        sessionInfo.sessionId = parseInt((new Date().getTime() / 1000).toFixed(), 10);
        sessionInfo.msgId = 0;
        sessionInfo.error = null;
        sessionInfo.url = inAccount.url; //initialize with global url, might change later.
        account = inAccount;
        if (account.datastores === undefined) {
          account.datastores = [];
        }
        for (i = 0; i < dsNames.length; i += 1) {
          ds = account.datastores[dsNames[i]];
          if (ds) {
            ds.name = dsNames[i];
            ds.type = dsTypes[i];
            ds.add = 0;
            ds.del = 0;
            ds.replace = 0;
            ds.addOwn = 0;
            ds.replaceOwn = 0;
            ds.delOwn = 0;
            ds.mapping = [];
            ds.state = "sendingInit";
            ds.ok = true;
          }
        }
        secondTry = false;

        if (!DeviceProperties.devID) {
          throw ({name: "MissingInformation", message: "Error: Need to fill DeviceProperties.devId before syncML can start."});
        } else {
          DeviceProperties.id = DeviceProperties.devID;
          //log("Will be known to server as " + DeviceProperties.id);
        }
	    } catch (e) {
	      logError_lib(e);
	    }
	  },

	  //finished 5.10.2011, is working with eGroupware, both ok and false.
		//callback will be called with true or false as argument.
		checkCredentials: function (callback) {
		  try {
		    nextMsg = syncMLMessage(); //TODO: ist das richtig so??? :(
		    nextMsg.addCredentials(account); //cool, will find username and password field. :)
		    nextMsg.setFinal(true);
		    resultCallback = callback;

		    sendToServer(nextMsg, parseCredResponse);
		  } catch (e) {
	      logError_lib(e);
	    }
		},

		sendSyncInitializationMsg: function (callback) {
		  var i, ds, datastores = [], doPutDevInfo = false;
		  try {
		    nextMsg = syncMLMessage();
		    nextMsg.addCredentials(account);
		    nextMsg.setFinal(true);
		    resultCallback = callback;

		    for (i = 0; i < dsNames.length; i += 1) {
		      ds = account.datastores[dsNames[i]];
		      if (ds && ds.enabled) {
		        ds.last = ds.next;
		        ds.next = (new Date().getTime() / 1000).toFixed();
		        nextMsg.addAlert({
		          data: SyncMLModes[ds.method],
		          items: [{
		            target: ds.path,
		            source: dsNames[i],
		            meta: { anchor: { next: ds.next, last: ds.last }}
		          }]
		        });
		        datastores.push({name: ds.name, type: ds.type});

		        if (!ds.serverType || !ds.serverId || ds.method === "slow" || ds.method === "refresh-from-client" || ds.method === "refresh-from-server") {
              doPutDevInfo = true;
              ds.lastRev = 0; //reset last rev on refresh.
		          nextMsg.doGetDevInfo();
		        }
		      }
		    }
        //if (doPutDevInfo) { //devInfo will be send, if we don't know anything about the server 
                          //or if we need to do slow sync, or refresh from client/server.
          putDevInfo(nextMsg, datastores, {type: "Put"});
        //}

		    logToApp("Sending initialization message to server.");
		    sendToServer(nextMsg, parseInitResponse);
		  } catch (e) {
	      logError_lib(e);
	    }
		},

		//callbacks of type: [ name: "calendar", ...]
		setCallbacks: function (callbacks) {
		  var i, ds;
		  log("Got calendar callbacks.");
		  for (i = 0; i < callbacks.length; i += 1) {
		    ds = account.datastores[callbacks[i].name];
		    if (ds) {
		      ds.getAllData = callbacks[i].getAllData;
		      ds.getNewData = callbacks[i].getNewData;
		      ds.deleteAllData = callbacks[i].deleteAllData;
		      ds.newEntry = callbacks[i].newEntry;
		      ds.updateEntry = callbacks[i].updateEntry;
		      ds.delEntry = callbacks[i].delEntry;
		    }
		  }
		},

		continueSync: mContinueSync
	};
}());
