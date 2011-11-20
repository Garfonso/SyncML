var SyncMLModes = { "two-way":             200, // TWO-WAY Specifies a client-initiated, two-way synchronization. 
        "slow":                201, // SLOW SYNC Specifies a client-initiated, two-way slow-synchronization. 
        "one-way-from-client": 202, // ONE-WAY FROM CLIENT Specifies the client-initiated, one-way only synchronization from the client to the server. 
        "refresh-from-client": 203, // REFRESH FROM CLIENT Specifies the client-initiated, refresh operation for the oneway only synchronization from the client to the server. 
        "one-way-from-server": 204, // ONE-WAY FROM SERVER Specifies the client-initiated, one-way only synchronization from the server to the client. 
        "refresh-from-server": 205 // REFRESH FROM SERVER Specifies the client-initiated, refresh operation of the one-way only synchronization from the server to the client. 
  };

var SyncML = (function() {
	//the object to communicate with the SyncML server.
	//for base64 decoding / encoding try window.atob() and window.btoa().

	//depends on the global "account" SyncMLAccount object.
	
	return {
		initialize : function(account) {
			this.sessionId = new Date().getTime();
			this.msgId = 1;
			this.cmdId = 1;
			this.error = null;
			
			this.url = account.url;

			this.xmlParser = new DOMParser();

			//syncML "parameter":
			this.maxMsgSize = 16 * 1024; //guessed value..
		},
		
		//returns current cmd Id and increments it for next call.
		getCmdId() {
		  var retVal = this.cmdId;
		  this.cmdId++;
		  return retVal;
		},
		
		//returns current msg id and increments it for next call. Also resets cmdId.
		//this is ok, because the msgId is always used in the header.
		getMsgId() {
		  var retVal = this.msgId;
		  this.msgId++;
		  this.cmdId = 1;
		  return retVal;
		}

		sendToServer : function(text, callback) {
			new Ajax.Request(this.url, {
				onComplete : callback,
				//asynchronous: false,
				postBody : text,
				method : 'post',
				contentType : 'application/vnd.syncml+xml'
			});
			log("It's out.");
		},

		//not used until now..
		checkStatus : function(xmlDoc, tag) {
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
		},

		buildCredHeader : function() {
			var login = account.username + ":" + account.password;
			var header;
			var base64login = Base64.encode(login); //TODO: exchange this against webOs Base64!
			var tags = formatCredentials(base64login);
			
			tags += formatMaxMsgSize(this.maxMsgSize);

			header = formatSyncHeader(this.sessionId, this.getMsgId(),
					account.deviceId, this.url, tags); //tags of the header.
			return header;
		},
		
		//finished 5.10.2011, is working with eGroupware, both ok and false.
		//callback will be called with true or false as argument.
		checkCredentials : function(callback) {
			if(!account.checkDeviceId(this.checkCredentials(callback)));
				return;
	
			var msg = formatXMLDeclaration(); //adds xml thingies
			msg += formatStartSyncML(); //<SyncML>
			msg += this.buildCredHeader();
			msg += formatStartSyncBody(); //<SyncMLBody>
			msg += formatFinal(); //is this necessary??
			msg += formatEndSyncBody();
			msg += formatEndSyncML();

			log("Sending to server: " + msg);
			this.sendToServer(msg, this.parseCredResponse.bind(this, callback));
		},

		parseCredResponse : function(callback, transport) {
			log("Got: ");
			log(transport.responseText);
			//log("full object: " + JSON.stringify(transport));

			var responseDOM = this.xmlParser.parseFromString(transport.responseText, "text/xml"); //get from XLM String to XML Dom.
			var data = responseDOM.getElementsByTagName("Data");
			log("Data: " + data);
			if (data == null || data.item(0).firstChild.nodeValue != 212) {
				log("Wrong credentials?");
				callback(false);
			} else
			{
				log("Good credentials.");
				callback(true);
			}
		},
		
		//syncMode will be decoded to numerical value
		//source means local database
		//target means distant database.
    //<Meta><Type xmlns="syncml:metinf">text/x-vcalendar</Type></Meta> <- das fehlt noch irgendwo..
		generateSyncAlert: function(syncMode, source, target, last, next) {
      msg += "<Alert>\n<CmdId>" + this.getCmdId() + "</CmdId>\n";
      msg += "<Data>" + SyncMLModes[syncMode] + "</Data>\n"; //set sync mode in data...
      msg += "<Item>\n";
      msg += "<Target><LocURI>" + target + "</LocURI></Target>\n";
      msg += "<Source><LocURI>" + source + "</LocURI></Source>\n";
      msg += "<Meta><Anchor xmlns='syncml:metinf'>"
          + "<Last>" + last + "</Last><Next> " + next + "</Next></Anchor></Meta>\n";
      msg += "</Item>\n";
      msg += "</Alert>\n";
		}
		
		sendSyncInitializationMsg: function(callback) {
			var msg = formatXMLDeclaration(); //adds xml thingies
			msg += formatStartSyncML(); //<SyncML>
			msg += this.buildCredHeader();
			msg += formatStartSyncBody(); //<SyncMLBody>
			
			if(account.syncCalendar)
			{
			  //add alert for sync type: 
			  msg += this.generateSyncAlert(account.syncCalendarMethod,"calendar",account.syncCalendarPath)
			}
			if(account.syncContacts)
			{
			  msg += this.generateSyncAlert(account.syncContactsMethod,"contacts",account.syncContactsPath)
			}
			
			msg += formatEndSyncBody();
			msg += formatEndSyncML();
			
			log("Sending to server: " + msg);
      this.sendToServer(msg, this.parseInitResponse.bind(this, callback));
		}
		
		parseInitResponse: function(callback, transport){
		  log("Got: ");
      log(transport.responseText);
      
      var responseDOM = this.xmlParser.parseFromString(transport.responseText, "text/xml"); //get from XLM String to XML Dom.
		}
	};
}());
