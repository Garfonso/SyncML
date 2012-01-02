//JSLint options:
/*global Ajax, log, Mojo, syncMLMessage, window */
/*jslint indent: 2 */

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
    man: "MoboSync for WebOs",
    mod: Mojo.Environment.DeviceInfo.modelName,
    oem: "MoboSync",
    fwv: "20.11.2011", //set firmware version to today.
    swv: Mojo.Environment.DeviceInfo.platformVersion + " appv 0.0.2", //set to full platform version.. that could help to work out vcard interpretation issues.
    hwv: "20.11.2011", //set hardware version to today, too.. doesn't really care.
    devID: undefined, //fill that from the account!
    devType: "phone", //say phone here. Also the tablet is "similar to a phone".. ;)

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

var SyncML = (function () {
  "use strict";
  var sessionInfo, account = {}, lastMsg,
  //callbacks to get event / contacts data as iCal / vCard strings.
  //will all receive a callback function as parameter, that is to be called with "false" in the case of errors.
  //otherwise it needs to be supplied to the called sync function!
  //data needs to be of form { data = whole data in vcard/ iCal string, localId = id on device } 
    calendar = {
      //needs to get all calendar data and call callback with { replace: [ all data here ] }, callback
      getAllData: function () { throw ({name: "LogicError", message: "Need to set calendar.getAllData callback to something."}); },
      //needs to get only new calendar data and call callback with { replace: [modified], add: [new], del: [deleted] }, callback
      getNewData: function () { throw ({name: "LogicError", message: "Need to set calendar.getNewData callback to something."}); },
      //this will be called on refresh from server to delete all local data. Call callback with {}.
      deleteAllData: function () { throw ({name: "LogicError", message: "Need to set calendar.deleteAllData callback to something."}); },
      //Param: {type: add, callback, globalId: ..., item: new item data }. call callback with {type: add, globalId: ..., localId: ... success: true/false }
      newEntry: function () { throw ({name: "LogicError", message: "Need to set calendar.newEntry callback to something."}); },
      //Param: {type: replace, callback, localId: ..., item: new data }. Call callback with { type: replace, globalId: ..., localId: ... success: true/false }.
      updateEntry: function () { throw ({name: "LogicError", message: "Need to set calendar.updateEntry callback to something."}); },
      //Param: { type: del, callback, localId: ... }. Call callback with { type: del, globalId: ..., localId: ... success: true/false }. 
      delEntry: function () { throw ({name: "LogicError", message: "Need to set calendar.delEntry callback to something."}); },
      //status variables:
      add: 0,
      del: 0,
      replace: 0,
      mapping: []
    },
    contacts = { //same as in calendar. TODO: will we really implement continueSyncContacts?
      //needs to get all calendar data and call continueSyncContacts with { replace: [ all data here ] }, callback
      getAllData: function () { throw ({name: "LogicError", message: "Need to set contacts.getAllData callback to something."}); },
      //needs to get only new contacts data and call continueSyncContacts with { replace: [modified], add: [new], del: [deleted] }, callback
      getNewData: function () { throw ({name: "LogicError", message: "Need to set contacts.getNewData callback to something."}); },
      //this will be called on refresh from server to delete all local data. Call continueSyncCalendar.
      deleteAllData: function () { throw ({name: "LogicError", message: "Need to set calendar.deleteAllData callback to something."}); },
      //Param: {type: add, callback, globalId: ..., item: new item data }. call callback with {type: add, globalId: ..., localId: ... success: true/false }
      newEntry: function () { throw ({name: "LogicError", message: "Need to set contacts.newEntry callback to something."}); },
      //Param: {type: replace, callback, localId: ..., item: new data }. Call callback with { type: replace, localId: ... success: true/false }.
      updateEntry: function () { throw ({name: "LogicError", message: "Need to set contacts.updateEntry callback to something."}); },
      //Param: { type: del, callback, localId: ... }. Call callback with { type: del, localId: ... success: true/false }. 
      delEntry: function () { throw ({name: "LogicError", message: "Need to set contacts.delEntry callback to something."}); },
      //status variables:
      add: 0,
      del: 0,
      replace: 0,
      mapping: []
    },
    secondTry = false,
    resultCallback, parseSyncResponse;

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
  function sendToServer(text, callback) {
    //log("Sending to " + sessionInfo.url);
    return new Ajax.Request(sessionInfo.url, {
      onFailure : function (error) { log("Request failed"); log(JSON.stringify(error)); },
      onSuccess : function (transport) { log("Request succeeded"); callback(transport); },
      //onComplete : function () { log("Request completed"); },
      postBody : text,
      method : 'post',
      contentType : 'application/vnd.syncml+xml'
    });
  }

  function parseLastResponse(transport) {
    var msg, failed, i;
    //log("Got: ");
    //log(transport.responseText);

    msg = syncMLMessage();
    //log("trying to parse msg...");
    msg.buildMessageFromResponse(transport.responseText);
    //log("last response parsed.");
    failed = msg.matchCommandsFromMessage(lastMsg);
    if (failed && failed.length > 0) {
      log("Have " + failed.length + " failed commands: ");
      for (i = 0; i < failed.length; i += 1) {
        log(JSON.stringify(failed[i]));
      }
      resultCallback({success: false});
    } else {
      //sync finished successful! :)
      log("All ok. Finished sync, call last callback.");
      resultCallback({success: true, account: account }); //return account to update next / last sync. Mode might also be set by server. Nothing else should have changed.
    }
  }

  function itemActionCalendarCallback(result) {
    var item, message, content;
    if (result && result.success) {
      log("item action success");
      calendar[result.type] -= 1;
      if (result.type === "add") {
        //log("Sync: " + JSON.stringify(lastMsg.getBody().sync[0]));
        //log("lastMsg: " + JSON.stringify(lastMsg));
        //log("lastMsg.body: " + JSON.stringify(lastMsg.getBody()));
        item = lastMsg.getBody().sync[result.globalId.sync][result.type][result.globalId.cmd].items[result.globalId.item];
        calendar.mapping.push({source: result.localId, target: item.source});
        log("Added id to mapping");
      }
    } else if (result && result.success === false) {
      log("item action failure");
      lastMsg.getBody().sync[result.globalId.sync][result.type][result.globalId.cmd].failure = true; //remember that this was a failure. Fail the whole command if any item fails.
      log("noted failure for status cmd.");
    }

    if (calendar.add + calendar.del + calendar.replace === 0) { //all callbacks finished:
      log("all change callbacks finished.");
      message = syncMLMessage();
      message.addStatuses(lastMsg); //will handly  failures, also. *phew*. => status finished.
      message.addMap({source: "calendar", target: account.syncCalendarPath, mapItems: calendar.mapping });
      if (!message.hasStatus() && calendar.mapping.length === 0) {
        log("message is empty => add alert 222");
        message.addAlert({ data: "222", items: [ { source: "calendar", target: account.syncCalendarPath } ] });
        log("add alert ok");
      }

      content = message.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});
      if (lastMsg.isFinal()) {
        sendToServer(content, parseLastResponse);
      } else {
        log("Not final message. there will be more.");
        sendToServer(content, parseSyncResponse); //continue sync.
      }
      lastMsg = message;
    }
  }

  //will need to see if any updates failed.
  //then the message will have changes from the server, that need to be processed.
  //in the end a new message containing mapings from local to global ids for new items 
  //needs to be generated and send.
  //remark: we don't check item type anywhere.. this would be the right place.
  parseSyncResponse = function (transport) {
    var msg, failed, i, j, k, sync, content;
    //log("Got: ");
    //log(transport.responseText);

    msg = syncMLMessage();
    msg.buildMessageFromResponse(transport.responseText);
    //log("Sync message had sync: " + JSON.stringify(lastMsg.getBody().sync));
    failed = msg.matchCommandsFromMessage(lastMsg);
    if (failed && failed.length > 0) {
      log("Have " + failed.length + " failed commands: ");
      for (i = 0; i < failed.length; i += 1) {
        log(JSON.stringify(failed[i]));
      }
      resultCallback({success: false});
    } else {
      if (!msg.getBody().sync || msg.getBody().sync.length === 0) {
        log("Did not receive a sync cmd.");
        if (!secondTry) {
          log("Try a get next msg command.");
          lastMsg = msg;
          msg = syncMLMessage();
          msg.addStatuses(lastMsg);
          msg.addAlert({ data: "222", items: [ { source: "contacts", target: account.syncContactsPath } ] });
          content = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});
          sendToServer(content, parseSyncResponse);
          lastMsg = msg;
          return;
        } else {
          log("Already had second try, something failed.");
          resultCallback({success: false});
          return;
        }
      }
      secondTry = false;

      //server will answer with sync-command(s) that contains server changes:
      for (i = 0; msg.getBody().sync && i < msg.getBody().sync.length; i += 1) {
        log("Processing sync " + (i + 1) + " of " + msg.getBody().sync.length + " syncs.");
        sync = msg.getBody().sync[i];

        for (j = 0; sync.add && j < sync.add.length; j += 1) {
          for (k = 0; k < sync.add[j].items.length; k += 1) {
            calendar.add += 1;
            calendar.newEntry(
              {
                type: "add",
                callback: itemActionCalendarCallback,
                globalId: {sync: i, item: k, cmd: j, cmdId: sync.add[j].cmdId }, //abuse cmdId to get globalId later and find status better later. :)
                item: sync.add[j].items[k].format === "b64" ? window.atob(sync.add[j].items[k].data) : sync.add[j].items[k].data
              }
            );
          }
        }
        for (j = 0; sync.del && j < sync.del.length; j += 1) {
          for (k = 0; k < sync.del[j].items.length; k += 1) {
            calendar.del += 1;
            calendar.delEntry(
              {
                type: "del",
                callback: itemActionCalendarCallback,
                globalId: {sync: i, item: k, cmd: j, cmdId: sync.del[j].cmdId }, //abuse cmdId to get globalId later and find status better later. :)
                localId: sync.del[j].items[k].source
                //item: sync.del[j].items[k].format === "b64" ? window.atob(sync.del[j].items[k].data) : sync.del[j].items[k].data //most probably undefined for delete.
              }
            );
          }
        }
        for (j = 0; sync.replace && j < sync.replace.length; j += 1) {
          for (k = 0; k < sync.replace[j].items.length; k += 1) {
            calendar.replace += 1;
            calendar.updateEntry(
              {
                type: "replace",
                callback: itemActionCalendarCallback,
                globalId: {sync: i, item: k, cmd: j, cmdId: sync.replace[j].cmdId }, //abuse cmdId to get globalId later and find status better later. :)
                localId: sync.replace[j].items[k].source,
                item: sync.replace[j].items[k].format === "b64" ? window.atob(sync.replace[j].items[k].data) : sync.replace[j].items[k].data
              }
            );
          }
        }
      }
      log("Parsing of sync response finished.");
      lastMsg = msg; //save msg for later reference.
      itemActionCalendarCallback({}); //in case there was no action to be done, continue with sync by calling itemActionCalendarCallback.
    }
  };

  function mContinueSyncCalendar(data) {
    var msg = syncMLMessage(), i, content;
    if (!data.success) {
      resultCallback({success: false});
      return;
    }
    if (data.add) {
      for (i = 0; i < data.add.length; i += 1) {
        msg.addSyncCmd({
          type: "add",
          item: {
            data: data.add[i].data,
            source: data.add[i].localId,
            target: data.add[i].uid,
            meta: {
              type: "text/calendar"
              //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
            }
          }
        });
      }
    }
    if (data.del) {
      for (i = 0; i < data.del.length; i += 1) {
        msg.addSyncCmd({
          type: "del",
          item: {
            //data: data.del[i].data, //data not necessary for delete.
            source: data.del[i].localId,
            target: data.del[i].uid,
            meta: {
              type: "text/calendar"
              //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
            }
          }
        });
      }
    }
    if (data.replace) {
      for (i = 0; i < data.replace.length; i += 1) {
        msg.addSyncCmd({
          type: "replace",
          item: {
            data: data.replace[i].data,
            source: data.replace[i].localId,
            target: data.replace[i].uid,
            meta: {
              type: "text/calendar"
              //size: data.replace[i].data.length
              //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
            }
          }
        });
      }
    }

    msg.addStatuses(lastMsg); //should only be like one sync-alert.
    //we need to send sync command to initialize sync, even if we don't have data.
    //initialize target / source for sync cmd.
    msg.setSyncTargetSource({ source: "calendar", target: account.syncCalendarPath });

    content = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});
    //log("Sending to server: " + content);
    sendToServer(content, parseSyncResponse);
    lastMsg = msg;
  }

  function mContinueSyncContacts(data) {
    var msg = syncMLMessage(), i, content;
    if (data.add) {
      for (i = 0; i < data.add.length; i += 1) {
        msg.addSyncCmd({
          type: "add",
          item: {
            data: data.add[i].data,
            source: data.add[i].localId,
            target: data.add[i].uid,
            meta: {
              type: "text/vcard"
              //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
            }
          }
        });
      }
    }
    if (data.del) {
      for (i = 0; i < data.del.length; i += 1) {
        msg.addSyncCmd({
          type: "del",
          item: {
            //data: data.del[i].data, //data not necessary for delete.
            source: data.del[i].localId,
            target: data.del[i].uid,
            meta: {
              type: "text/vcard"
              //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
            }
          }
        });
      }
    }
    if (data.replace) {
      for (i = 0; i < data.replace.length; i += 1) {
        msg.addSyncCmd({
          type: "replace",
          item: {
            data: data.replace[i].data,
            source: data.replace[i].localId,
            target: data.replace[i].uid,
            meta: {
              type: "text/vcard"
              //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
            }
          }
        });
      }
    }

    msg.addStatuses(lastMsg); //should only be like one sync-alert.
    //if we don't have any data, add alert with "next-message" code.
    if ((!data.add || data.add.length === 0) && (!data.del || data.del.length === 0) && (!data.replace || data.replace.length === 0)) {
      msg.addAlert({ data: "222", items: [ { source: "contacts", target: account.syncContactsPath } ] });
    }
    content = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});
    //log("Sending to server: " + content);
    sendToServer(content, parseSyncResponse);
    lastMsg = msg;
  }

  //this will try to get all changes from the device.
  //TODO: this most probably won't work if calendar and contacts are enabled, because two asynchronous functions are called and not synchronized again. 
  //need to handle that where I build the next message to the server.
  function getSyncData() {
    if (account.syncCalendar) {
      if (account.syncCalendarMethod === "slow" ||
            account.syncCalendarMethod === "refresh-from-client") {
        log("Getting all calendar data, because of slow sync or refresh from client.");
        calendar.getAllData(mContinueSyncCalendar);
      }
      if (account.syncCalendarMethod === "two-way" ||
            account.syncCalendarMethod === "one-way-from-client") {
        log("Getting new calendar data, because of two-way sync or one way from client.");
        calendar.getNewData(mContinueSyncCalendar);
      }
      if (account.syncCalendarMethod === "refresh-from-server") {
        log("Deleting all calendar data, because of refresh from server.");
        calendar.deleteAllData(mContinueSyncCalendar);
      }
      if (account.syncCalendarMethod === "one-way-from-server") {
        log("Don't get any calendar data, because of one way from server sync.");
        mContinueSyncCalendar({});
      }
    }
    if (account.syncContacts) {
      if (account.syncContactsMethod === "slow" ||
            account.syncContactsMethod === "refresh-from-client") {
        contacts.getAllData(mContinueSyncContacts);
      }
      if (account.syncContactsMethod === "two-way" ||
            account.syncContactsMethod === "one-way-from-client") {
        contacts.getNewData(mContinueSyncContacts);
      }
      if (account.syncContactsMethod === "refresh-from-server") {
        contacts.deleteAllData(mContinueSyncContacts);
      }
      if (account.syncContactsMethod === "one-way-from-server") {
        mContinueSyncContacts({});
      }
    }
  }

  function parseInitResponse(transport) {
    var msg, failed, numProblems = 0, i, alert, needRefresh = false;
    //log("Got: ");
    //log(transport.responseText);

    msg = syncMLMessage();
    //log("trying to parse msg...");
    msg.buildMessageFromResponse(transport.responseText);
    //log("initial response parsed.");
    failed = msg.matchCommandsFromMessage(lastMsg);
    if (failed && failed.length > 0) {
      numProblems = failed.length;
      log("Have " + failed.length + " failed commands: ");
      for (i = 0; i < failed.length; i += 1) {
        log(JSON.stringify(failed[i]));
        if (failed[i].status.cmdName === "Alert" && failed[i].status.data === "508") { //server requires refresh.
        //TODO: this does not really work for more than one source, right??
        //if (failed[i].status.cmdRef === lastMsg.getBody().alerts[0].cmdId) { //got response to cmdRef.
          log("No problem, server just wants a refresh.");
          needRefresh = true;
          numProblems -= 1;
        }
      }
    }
    if (numProblems) {
      log(numProblems + " real problems left... break.");
      resultCallback({success: false});
      return;
    } else {
      if (msg.getHeader().respURI) {
        sessionInfo.url = msg.getHeader().respURI;
        log("Got new response URI " + sessionInfo.url);
      }
      //server will answer with sync-alerts, which might have a different sync mode, like slow for first sync:
      //TODO: maybe some other server will already send a sync cmd with data here?? See if that happens...
      for (i = 0; i < msg.getBody().alerts.length; i += 1) {
        alert = msg.getBody().alerts[i];
        //log("Alert: " + JSON.stringify(alert));
        if (alert.items && alert.items[0] && alert.items[0].target === "calendar") {
          if (alert.data) {
            log("Got syncCalendarMethod: " + alert.data);
            account.syncCalendarMethod = SyncMLAlertCodes[alert.data];
            needRefresh = false;
          }
          if (alert.items && alert.items[0] && alert.items[0].meta && alert.items[0].meta.anchor && alert.items[0].meta.anchor.last) {
            log("Got server-last: " + alert.items[0].meta.anchor.last + " and have own server-last: " + account.syncCalendarServerNext);
            //account.syncCalendarServerNext = alert.items[0].meta.anchor.last;
          }
          if (alert.items && alert.items[0] && alert.items[0].meta && alert.items[0].meta.anchor && alert.items[0].meta.anchor.next) {
            log("Got next: " + alert.items[0].meta.anchor.next + " for server, save.");
            account.syncCalendarServerNext = alert.items[0].meta.anchor.next;
          }
        }
        if (alert.items && alert.items[0] && alert.items[0].target === "contacts") {
          if (alert.data) {
            account.syncContactsMethod = SyncMLAlertCodes[alert.data];
          }
        }
      }
      if (needRefresh) {
        log("Server told us that we need to refresh, but did not send a alert for that... fail. :(");
        resultCallback({success: false});
        return;
      }
      //log("Call getSyncData()");
      lastMsg = msg;
      getSyncData();
    }
  }

  function parseCredResponse(transport) {
    var responseMsg, status;

    //log("Got response: " + transport.responseText);

    responseMsg = syncMLMessage();
    responseMsg.buildMessageFromResponse(transport.responseText);
    status = responseMsg.getBody().status[sessionInfo.msgId]["0"].data; //status of last msg and header => allways 0. 
    if (status === "212" || status === "200") {
      log("Good credentials.");
      resultCallback(true);
    } else {
      log("Wrong credentials?, status data: " + status);
      resultCallback({success: false});
    }
  }

  //define public interface:
	return {
	  initialize: function (inAccount) {
	    sessionInfo.sessionId = new Date().getTime();
	    sessionInfo.msgId = 0;
	    sessionInfo.error = null;
	    sessionInfo.url = inAccount.url; //initialize with global url, might change later.
	    account = inAccount; //TODO: is this still a reference?
	    secondTry = false;

	    if (!DeviceProperties.devID) {
	      throw ({name: "MissingInformation", message: "Error: Need to fill DeviceProperties.devId before syncML can start."});
	    } else {
	      DeviceProperties.id = DeviceProperties.devID;
	      log("Will be known to server as " + DeviceProperties.id);
	    }
	  },

	  //finished 5.10.2011, is working with eGroupware, both ok and false.
		//callback will be called with true or false as argument.
		checkCredentials: function (callback) {
		  var content, msg = syncMLMessage(); //TODO: ist das richtig so??? :(
		  msg.addCredentials(account); //cool, will find username and password field. :)
		  msg.setFinal(true);
		  resultCallback = callback;

		  content = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});

			//log("Sending to server: " + content);
			sendToServer(content, parseCredResponse);
			lastMsg = msg;
		},

		sendSyncInitializationMsg: function (callback) {
		  var msg = syncMLMessage(), datastores = [], content;
			msg.addCredentials(account);
			msg.setFinal(true);
			resultCallback = callback;

			if (account.syncCalendar) {
			  account.syncCalendarLast = account.syncCalendarNext;
			  account.syncCalendarNext = (new Date().getTime() / 1000).toFixed();
			  msg.addAlert({
			    data: SyncMLModes[account.syncCalendarMethod],
			    items: [{
			      target: account.syncCalendarPath,
			      source: "calendar",
			      meta: { anchor: { next: account.syncCalendarNext, last: account.syncCalendarLast }}
			    }]
			  });
			  datastores.push({name: "calendar", type: "text/calendar"});
			}

			if (account.syncContacts) {
	      account.syncContactsLast = account.syncContactsNext;
	      account.syncContactsNext = new Date().getTime();
        msg.addAlert({
          data: SyncMLModes[account.syncContactsMethod],
          items: [{
            target: account.syncContactsPath,
            source: "contacts",
            meta: { anchor: { next: account.syncContactsNext, last: account.syncContactsLast }}
          }]
        });
        datastores.push({name: "contacts", type: "text/vcard"}); //TODO: is this correct for contacts?
			}

		  msg.addPutDevInfo(DeviceProperties, datastores);

		  content = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});
			//log("Sending to server: " + content);
      sendToServer(content, parseInitResponse);
      lastMsg = msg;
		},

		setCalendarCallbacks: function (callbacks) {
		  log("Got calendar callbacks.");
		  calendar = callbacks;
		  calendar.add = 0;
		  calendar.del = 0;
		  calendar.replace = 0;
		  calendar.mapping = [];
		},

		setContactsCallbacks: function (callbacks) {
		  log("Got contacts callbacks.");
		  contacts = callbacks;
		  contacts.add = 0;
		  contacts.del = 0;
		  contacts.replace = 0;
		  contacts.mapping = [];
		},

		continueSyncCalendar: mContinueSyncCalendar,

		continueSyncContacts: mContinueSyncContacts
	};
}());
