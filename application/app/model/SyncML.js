//JSLint options:
/*global Ajax, log, Mojo, syncMLMessage */
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
    man: "HP",
    mod: Mojo.Environment.DeviceInfo.modelName,
    oem: "HP",
    fwv: "20.11.2011", //set firmware version to today.
    swv: Mojo.Environment.DeviceInfo.platformVersion, //set to full platform version.. that could help to work out vcard interpretation issues.
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

var SyncML = (function () {
  "use strict";
  var sessionInfo, account = {}, lastMsg, update = [], del = [], add = [],
  //callbacks to get event / contacts data as iCal / vCard strings.
  //will all receive a callback function as parameter, that is to be called with "false" in the case of errors.
  //otherwise it needs to be supplied to the called sync function!
  //data needs to be of form { data = whole data in vcard/ iCal string, localId = id on device }
  getAllCalendarData, //needs to get all calendar data and call continueSyncCalendar with { update: [ all data here ] }, callback
  getNewCalendarData, //needs to get only new calendar data and call continueSyncCalendar with { update: [modified], add: [new], del: [deleted] }, callback
  getAllContactsData, //same as calendar only for contacts.
  getNewContactsData; //same as calendar only for contacts.
	//the object to communicate with the SyncML server.
	//for base64 decoding / encoding try window.atob() and window.btoa().

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
    log("Callback: " + callback + " - " + JSON.stringify(callback));
    log("Sending to " + sessionInfo.url);
    return new Ajax.Request(sessionInfo.url, {
      //success and failure don't seem to be called... why the hell??? Stupid thing. :(
      //callback log("Got: " + transport.responseText);
      onFailure : function () { log("Request failed"); },
      onSuccess : function (transport) { log("Request succeeded"); callback(transport); },
      onComplete : function () { log("Request completed"); },
      postBody : text,
      method : 'post',
      contentType : 'application/vnd.syncml+xml'
    });
  }

  function parseCredResponse(callback, transport) {
    var responseMsg, status;

    log("Got response: " + transport.responseText);

    responseMsg = syncMLMessage();
    responseMsg.buildMessageFromResponse(transport.responseText);
    status = responseMsg.getBody().status[sessionInfo.msgId]["0"].data; //status of last msg and header => allways 0. 
    if (status === "212" || status === "200") {
      log("Good credentials.");
      callback(true);
    } else {
      log("Wrong credentials?, status data: " + status);
      callback(false);
    }
  }

  //this will try to get all changes from the device.
  //TODO: this most probably won't work if calendar and contacts are enabled, because two messages will be build and send unsynchronized... hm.. :(
  function getSyncData(callback) {
    if (account.syncCalendar) { 
      if (account.syncCalendarMethod === "slow" ||
            account.syncCalendarMethod === "refresh-from-client") {
        getAllCalendarData(callback);
      }
      if (account.syncCalendarMethod === "two-way" ||
            account.syncCalendarMethod === "one-way-from-client") {
        getNewCalendarData(callback);
      }
    }
    if (account.syncContacts) { 
      if (account.syncContactsMethod === "slow" ||
            account.syncContactsMethod === "refresh-from-client") {
        getAllContactsData(callback);
      }
      if (account.syncContactsMethod === "two-way" ||
            account.syncContactsMethod === "one-way-from-client") {
        getNewContactsData(callback);
      }
    }
  }

  //will need to see if any updates failed.
  //then the message will have changes from the server, that need to be processed.
  //in the end a new message containing mapings from local to global ids for new items 
  //needs to be generated and send.
  function parseSyncResponse(callback, transport) {
    var msg, failed, i, alert;
    log("Got: ");
    log(transport.responseText);

    msg = syncMLMessage();
    log("trying to parse msg...");
    msg.buildMessageFromResponse(transport.responseText);
    log("msg parsed...");
    failed = msg.matchCommandsFromMessage(lastMsg);
    if (failed) {
      log("Have " + failed.length + " failed commands: ");
      for (i = 0; i < failed.length; i += 1) {
        log(JSON.stringify(failed[i]));
      }
      callback(false);
    } else {
      //server will answer with sync-command(s) that contains server changes:
      for (i = 0; i < msg.getBody().sync.length; i += 1) {
        alert = msg.getBody().alerts[i];
        if (alert.target === "calendar") {
          if (alert.data !== SyncMLModes[account.syncCalendarMethod]) {
            account.syncCalendarMethod = SyncMLAlertCodes[alert.data];
          }
        }
        if (alert.target === "contacts") {
          if (alert.data !== SyncMLModes[account.syncContactsMethod]) {
            account.syncContactsMethod = SyncMLAlertCodes[alert.data];
          }
        }
      }
      getSyncData(callback);
    }
  }

  function parseInitResponse(callback, transport) {
    var msg, failed, i, alert;
    log("Got: ");
    log(transport.responseText);

    msg = syncMLMessage();
    log("trying to parse msg...");
    msg.buildMessageFromResponse(transport.responseText);
    log("msg parsed...");
    failed = msg.matchCommandsFromMessage(lastMsg);
    if (failed) {
      log("Have " + failed.length + " failed commands: ");
      for (i = 0; i < failed.length; i += 1) {
        log(JSON.stringify(failed[i]));
      }
      callback(false);
    } else {
      if (msg.getHeader().respURI) {
        sessionInfo.url = msg.getHeader().respURI;
        log("Got new response URI " + sessionInfo.url);
      }
      //server will answer with sync-alerts, which might have a different sync mode, like slow for first sync:
      for (i = 0; i < msg.getBody().alerts.length; i += 1) {
        alert = msg.getBody().alerts[i];
        if (alert.target === "calendar") {
          if (alert.data !== SyncMLModes[account.syncCalendarMethod]) {
            account.syncCalendarMethod = SyncMLAlertCodes[alert.data];
          }
        }
        if (alert.target === "contacts") {
          if (alert.data !== SyncMLModes[account.syncContactsMethod]) {
            account.syncContactsMethod = SyncMLAlertCodes[alert.data];
          }
        }
      }
      getSyncData(callback);
    }
  }

  //define public interface:
	return {
	  initialize: function (inAccount) {
	    sessionInfo.sessionId = new Date().getTime();
	    sessionInfo.msgId = 1;
	    sessionInfo.error = null;
	    sessionInfo.url = inAccount.url; //initialize with global url, might change later.
	    account = inAccount; //TODO: is this still a reference?

	    if (!DeviceProperties.devID) {
	      throw ({name: "MissingInformation", message: "Error: Need to fill DeviceProperties.devId before syncML can start."});
	    } else {
	      DeviceProperties.id = DeviceProperties.man + DeviceProperties.mod + DeviceProperties.devID;
	      log("Will be known to server as " + DeviceProperties.id);
	    }
	  },

		//not used until now..
		/*checkStatus : function(xmlDoc, tag) {
			var xpath = "/SyncML/SyncBody/Status[Cmd=\"" + tag + "\"]/Data";
			var nodes = xmlDoc.evaluate(xpath, xmlDoc, null,
					XPathResult.ANY_TYPE, null);
			var result = nodes.iterateNext();
			if (result === null) {
				log("No " + tag + " Status received");
			}
			while (result) {
				var code = parseInt(result.firstChild.nodeValue, 10);
				log("Status for " + tag + " = " + result.firstChild.nodeValue);
				if (code == 401) {
					this.error = "Invalid credentials";
					return;
				} else if (code == 403) {
					this.error = "Forbidden";
					return;
				} else if (code == 404) {
					this.error = "Source URI not found on server";
					return;
				} else if (code == 503) {
					this.error = "Server busy, another sync in progress";
					return;
				} else if (code == 506) {
					this.error = "Error processing source";
					return;
				}
				result = nodes.iterateNext();

			}
		},*/

	  //finished 5.10.2011, is working with eGroupware, both ok and false.
		//callback will be called with true or false as argument.
		checkCredentials: function (callback) {
		  var content, msg = syncMLMessage(); //TODO: ist das richtig so??? :(
		  msg.addCredentials(account); //cool, will find username and password field. :)
		  msg.setFinal(true);

		  content = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});

			log("Sending to server: " + content);
			sendToServer(content, parseCredResponse.bind(this, callback)); //.bind(this,callback)); //TODO: do we need this bind? Can we pass that parameter nicer?
			lastMsg = msg;
		},

		sendSyncInitializationMsg: function (callback) {
		  var msg = syncMLMessage(), datastores = [], content;
			msg.addCredentials(account);
			msg.setFinal(true);

			if (account.syncCalendar) {
			  account.syncCalendarLast = account.syncCalendarNext;
			  account.syncCalendarNext = new Date().getTime();
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
			log("Sending to server: " + content);
      sendToServer(content, parseInitResponse.bind(this, callback));
      lastMsg = msg;
		},

		setCalendarCallbacks: function (all, modified) {
		  log("Got calendar callbacks.");
		  getAllCalendarData = all;
		  getNewCalendarData = modified;
		},

		setContactsCallbacks: function (all, modified) {
		  log("Got contacts callbacks.");
		  getAllContactsData = all;
		  getNewContactsData = modified;
		},
		
		continueSyncCalendar: function (data,callback) {
		  var msg = syncMLMessage(), i;
		  if (data.add) {
		    for (i = 0; i < data.add.length; i += 1) {
		      msg.addSyncCmd({
		        type: "add",
		        item: {
		          data: data.add[i].data,
		          source: data.add[i].localId,
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
              meta: {
                type: "text/calendar"
                //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
              }
            }
          });
        }
      }
      if (data.update) {
        for (i = 0; i < data.update.length; i += 1) {
          msg.addSyncCmd({
            type: "replace",
            item: {
              data: data.update[i].data,
              source: data.update[i].localId,
              meta: {
                type: "text/calendar"
                //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
              }
            }
          });
        }
      }

      content = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});
      log("Sending to server: " + content);
      sendToServer(content, parseSyncResponse.bind(this, callback));
      lastMsg = msg;
		},
		
		continueSyncContacts: function (data,callback) {
      var msg = syncMLMessage(), i;
      if (data.add) {
        for (i = 0; i < data.add.length; i += 1) {
          msg.addSyncCmd({
            type: "add",
            item: {
              data: data.add[i].data,
              source: data.add[i].localId,
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
              meta: {
                type: "text/vcard"
                //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
              }
            }
          });
        }
      }
      if (data.update) {
        for (i = 0; i < data.update.length; i += 1) {
          msg.addSyncCmd({
            type: "replace",
            item: {
              data: data.update[i].data,
              source: data.update[i].localId,
              meta: {
                type: "text/vcard"
                //format: "b64" //do we want b64? First try without, maybe.. easier to debug.
              }
            }
          });
        }
      }		  
		}

    content = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});
    log("Sending to server: " + content);
    sendToServer(content, parseSyncResponse.bind(this, callback));
    lastMsg = msg;
	};
}());
