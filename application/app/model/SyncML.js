//JSLint options:
/*global Ajax, log, Mojo, syncMLMessage */
/*jslint indent: 2 */

var SyncMLModes = {
    "two-way":             200, // TWO-WAY Specifies a client-initiated, two-way synchronization. 
    "slow":                201, // SLOW SYNC Specifies a client-initiated, two-way slow-synchronization. 
    "one-way-from-client": 202, // ONE-WAY FROM CLIENT Specifies the client-initiated, one-way only synchronization from the client to the server. 
    "refresh-from-client": 203, // REFRESH FROM CLIENT Specifies the client-initiated, refresh operation for the oneway only synchronization from the client to the server. 
    "one-way-from-server": 204, // ONE-WAY FROM SERVER Specifies the client-initiated, one-way only synchronization from the server to the client. 
    "refresh-from-server": 205 // REFRESH FROM SERVER Specifies the client-initiated, refresh operation of the one-way only synchronization from the server to the client. 
  };

//Other SyncML Alert Codes:
//https://core.forge.funambol.org/wiki/SyncMLAlertCodes
var SyncMLAlertCodes = {
    100: "show", //data should be shown to client.
    //client-initiated sync modes:
    200: "two-way",
    201: "slow",
    202: "one-way-from-client",
    203: "refresh-from-client",
    204: "one-way-from-server",
    205: "refresh-from-server",
    //server-initiated sync modes:
    206: "two-way-by-server",
    207: "one-way-from-client-by-server",
    208: "refresh-from-client-by-server",
    209: "one-way-from-server-by-server",
    210: "refresh-from-server-by-server",
    //misc:
    221: "result-alert", //requests sync results
    222: "next-message", //requests next message
    223: "no-end-of-data", //end of data not received => message missing? Syntax error?
    224: "suspend", //suspend sync session
    225: "resume"  // resume sync session
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

//TODO: move cmdId to syncMLMessage. Will not be used here, but there. :)

var SyncML = (function () {
  "use strict";
  var sessionInfo, account = {};
	//the object to communicate with the SyncML server.
	//for base64 decoding / encoding try window.atob() and window.btoa().

	//depends on the global "account" SyncMLAccount object.

  //private members & methods:
  sessionInfo = {
    sessionId: new Date().getTime(),
    msgId: 1,
    cmdId: 1, 
    error: null,
    url: ''
  };

  //returns current msg id and increments it for next call. Also resets cmdId.
  //this is ok, because the msgId is always used in the header.
  function getMsgId() {
    var retVal = sessionInfo.msgId;
    sessionInfo.msgId += 1;
    sessionInfo.cmdId = 1;
    return retVal;
  }

  //sends a message to the server.
  function sendToServer(text, callback) {
    log("Sending to " + sessionInfo.url);
    return new Ajax.Request(sessionInfo.url, {
      //success and failure don't seem to be called... why the hell??? Stupid thing. :(
      //onSuccess : callback,
      //onFailure : function (transport) { log("Request failed."); log("Got: " + JSON.stringify(transport)); },
      onComplete : callback, //function (transport) { log("Request completed"); log("Got: " + transport.responseText); },
      postBody : text,
      method : 'post',
      contentType : 'application/vnd.syncml+xml'
    });
  }

  //define public interface:
	return {
	  initialize: function (inAccount) {
	    sessionInfo.sessionId = new Date().getTime();
	    sessionInfo.msgId = 1;
	    sessionInfo.cmdId = 1;
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

	  parseCredResponse : function (callback, transport) {
	    var responseMsg, status;

	    log("transport:" + JSON.stringify(transport));
	    log("callback:" + JSON.stringify(callback));
	    
	    log("Got: ");
	    log(transport.responseText);

	    responseMsg = syncMLMessage();
	    responseMsg.buildMessageFromResponse(transport.responseText);
	    status = responseMsg.body.status[1][0].data; //status of header of first msg. Make that dynamic to the previous msg. 
	    if (status === 212 || status === 200) {
	      log("Good credentials.");
	      callback(true);
	    } else {
	      log("Wrong credentials?, status data: " + status);
	      callback(false);
	    }
    },

		//finished 5.10.2011, is working with eGroupware, both ok and false.
		//callback will be called with true or false as argument.
		checkCredentials : function (callback) {
		  var content, msg = syncMLMessage(); //TODO: ist das richtig so??? :(
		  msg.addCredentials(account); //cool, will find username and password field. :)
		  msg.setFinal(true);

		  content = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: getMsgId(), target: account.url, source: DeviceProperties.id});

			log("Sending to server: " + content);
			sendToServer(content, this.parseCredResponse.bind(this, callback)); //TODO: do we need this bind? Can we pass that parameter nicer?
		},

		sendSyncInitializationMsg: function (callback) {
			/*var msg = formatXMLDeclaration(); //adds xml thingies
			msg += formatStartSyncML(); //<SyncML>
			msg += this.buildCredHeader();
			msg += formatStartSyncBody(); //<SyncMLBody>

			if(this.account.syncCalendar)
			{
			  //add alert for sync type: 
			  msg += this.generateSyncAlert(this.account.syncCalendarMethod,"calendar",this.account.syncCalendarPath)
			}
			if(this.account.syncContacts)
			{
			  msg += this.generateSyncAlert(this.account.syncContactsMethod,"contacts",this.account.syncContactsPath)
			}

			msg += formatEndSyncBody();
			msg += formatEndSyncML();

			log("Sending to server: " + msg);
      this.sendToServer(msg, this.parseInitResponse.bind(this, callback));*/
		},

		parseInitResponse: function (callback, transport) {
		  var msg;
		  log("Got: ");
      log(transport.responseText);

      msg = syncMLMessage();
      msg.buildMessageFromResponse(transport.responseText);
		}
	};
}());
