var curSyncManager = null;
SyncManager = Class.create({
		initialize: function(syncUrl, userName, password, devId) {
			this.syncUrl = syncUrl;
			this.userName = userName;
			this.password = password;
			this.devId = devId;
			this.login = userName + ":" + password;
			this.msgID = 0;
			this.maxMsgSize = 16*1024;
			this.deviceConfig = new DeviceConfig(this.devId);
			this.sendDevInf = false;
			this.cmdID = 0;
			this.logCallBack = function(text){};
			this.errorCallBack = function(error){};
			this.error = null;
			this.serverAlerts = null;
			this.statusList = null;
			this.mappingManager = null;
		},
		
		setLogCallback: function(callback) {
			this.logCallBack = callback;
		},
		
		setErrorCallback: function(callback) {
			this.errorCallBack = callback;
		},
		
		resetMsgID: function() {
			this.msgID = 1;
		},
		
		resetCmdID: function() {
			this.cmdID = 0;
		},
		
		dummyValues: function() {
			this.cmdId = 0;
			this.resetMsgID();
			this.sessionId = new Date().getTime();
			this.sendDevInf = true;
			this.sourceName = "dummy";
			this.sourceType = "text/plain";
			this.source = new SyncSource({
					name: 'dummy',
					type: 'text/plain',
					encoding: 'none',
					remoteUri: 'file',
					syncMode: 201
			});
		},
		
		getNextCmdId: function() {
			this.cmdID++;
			return this.cmdID;
		},
		
		getNextMsgID: function() {
			this.msgID++;
			return this.msgID;
		},
		
		prepareInitializationMessage: function(syncMode, requireDevInf) {
			var xml = formatXMLDeclaration();
			base64login = Base64.encode(this.login);
			var login = formatCredentials(base64login);
			var maxMsgSize = formatMaxMsgSize(this.maxMsgSize);
			// Add more stuff here
			var startBody = formatStartSyncBody();
			var tags = login + maxMsgSize;
			var header = formatSyncHeader(this.sessionID, this.msgID, 
				this.devId, this.syncUrl,
				tags); 
			
			// Got header, now construct syncbody
			var nextAnchor = this.source.getNextAnchor();
			var lastAnchor = this.source.getLastAnchor();
			var syncSourceMode = this.source.syncMode;
			var remoteUri = this.source.remoteUri;
			var filter = null;
			var sourceName = this.source.name;
			var maxDataSize = this.maxMsgSize - 3072;
			this.resetCmdID();
			
			var alerts = formatAlerts(this.getNextCmdId(),
				syncMode, nextAnchor,
				lastAnchor, syncSourceMode,
				sourceName, remoteUri, filter,
				maxDataSize);
			
			var devInf = "";
			if (this.sendDevInf) {
				devInf = formatPutDeviceInfo(this.getNextCmdId(), this.deviceConfig, this.sourceName, this.sourceType);
			}
			var finalStr = formatFinal();
			var endBodyStr = formatEndSyncBody();
			var endSyncML = formatEndSyncML();
			var ret = xml + formatStartSyncML()+  header +  startBody + alerts +  devInf + formatFinal() +  formatEndSyncBody() + formatEndSyncML();
			return ret;
		},
		
		sync:  function(source, syncMode, askServerDevInf) {
			this.resetCmdID();
			this.resetMsgID();
			this.source = source;
			this.syncMode = syncMode;
			this.source.setNextAnchor(new Date().getTime());
			this.sessionID = "" + new Date().getTime();
			var initMsg = this.prepareInitializationMessage(syncMode, askServerDevInf);
			this.logCallBack(initMsg);
			this.sendToServer(initMsg, this.syncGotInitialResponse.bind(this));
		},
		
		syncGotInitialResponse: function(transport) {
			this.logCallBack(">>>>> GOT:");
			this.logCallBack(transport.responseText);
			var responseDOM = this.parseXMLResponse(transport.responseText);
			// Check for Status elements
			this.checkStatus(responseDOM,"SyncHdr");
			if (this.error) {
				this.errorCallBack(this.error);
				return;
			}
			this.checkStatus(responseDOM,"Alert");
			if (this.error) {
				this.errorCallBack(this.error);
				return;
			}
			
			this.statusList = [];
			this.checkSyncHdr(responseDOM);
			this.checkServerAlerts(responseDOM);
			
			var alertCode = this.getSourceAlertCode(this.source.name);
			this.logCallBack("Initalization successfully completed");
			if (alertCode == 201 && this.syncMode == 250) {
				this.logCallBack("Client requested a one way from client no slow");
				this.logCallback("but server forced a slow sync");
			}
			
			var addDevInfResults = this.isGetCommandFromServer(responseDOM);
			this.logCallBack("Need add dev inf? " + addDevInfResults);
			var defInf = null;
			// TODO: process devInf response
			
			var respURIxpath = "/SyncML/SyncHdr/RespURI";
			var respURInodes = responseDOM.evaluate(respURIxpath, responseDOM, null, XPathResult.ANY_TYPE,null);
			this.syncUrl = respURInodes.iterateNext().firstChild.nodeValue;
			
			// ---------
			// SYNC PHASE
			// ---------
			var mappingStatus = 0; // 0 = get, 1 = new
			switch(alertCode) {
				case 200: // TWO-WAY Specifies a client-initiated, two-way synchronization. 
				case 201: // SLOW SYNC Specifies a client-initiated, two-way slow-synchronization. 
				case 202: // ONE-WAY FROM CLIENT Specifies the client-initiated, one-way only synchronization from the client to the server. 
				case 203: // REFRESH FROM CLIENT Specifies the client-initiated, refresh operation for the oneway only synchronization from the client to the server. 
				case 204: // ONE-WAY FROM SERVER Specifies the client-initiated, one-way only synchronization from the server to the client. 
					mappingStatus = 0;
					break;
				case 205: // REFRESH FROM SERVER Specifies the client-initiated, refresh operation of the one-way only synchronization from the server to the client. 
	
				case 206: // TWO-WAY BY SERVER Specifies a server-initiated, two-way synchronization. 
				case 207: // ONE-WAY FROM CLIENT BY SERVER Specifies the server-initiated, one-way only synchronization from the client to the server. 
				case 208: // REFRESH FROM CLIENT BY SERVER Specifies the server-initiated, refresh operation for the oneway only synchronization from the client to the server. 
				case 209: // ONE-WAY FROM SERVER BY SERVER Specifies the server-initiated, one-way only synchronization from the server to the client. 
				case 210: // REFRESH FROM SERVER BY SERVER Specifies the server-initiated, refresh operation of the oneway only synchronization from the server to the client. 
				case 250: // Reserved for future SyncML usage. 
				case 0:
					mappingStatus = 1;
					break;				
			}
			this.mappingManager = new DepotMappingManager(this.source.name);
			this.mappingManager.getMappings(this.syncMappingCallback.bind(this),this.syncMappingFailure.bind(this));
		},
		
		syncMappingCallback: function(data) {
			if (data !== null) {
				this.mappings = data;
				this.hierachy = data;
			} else {
				this.mappings = {};
				this.hierachy = {};
			}
			if (this.hierachy["/"] === null) {
				this.hierachy["/"] = "/";
			}
			var lastMappingSent = (this.mappings.length === 0);
			this.logCallBack("Starting Sync");
			
			this.source.beginSync();
			this.sendItemsLoop();
		},
				
		syncMappingFailure: function() {
			this.errorCallBack("Error getting mappings");
		},

		sendItemsLoop: function() {
			var command = formatSyncHdrStatus(200);
			
			//TODO: mapping??
		},
		
		sendToServer: function(text, callback) {
			new Ajax.Request(this.syncUrl, {
					onComplete: callback,
					//asynchronous: false,
					postBody: text,
					method: 'post',
			contentType: 'application/vnd.syncml+xml'});
		},
		
		parseXMLResponse: function(text) {
			var parser = new DOMParser();
			var xmlDoc = parser.parseFromString(text,"text/xml");
			return xmlDoc;
		},
		
		checkStatus: function(xmlDoc,tag) {
			var xpath = "/SyncML/SyncBody/Status[Cmd=\""+tag+"\"]/Data";
			var nodes = xmlDoc.evaluate(xpath, xmlDoc, null, XPathResult.ANY_TYPE,null);
			var result = nodes.iterateNext();
			if (result === null) {
				this.logCallBack("No " + tag + " Status received");
			}
			while(result) {
				var code = parseInt(result.firstChild.nodeValue,10);
				this.logCallBack("Status for " + tag + " = " + result.firstChild.nodeValue);
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
		
		checkSyncHdr: function(xmlDoc) {
			var xpath = "/SyncML/SyncHdr/MsgID";
			var nodes = xmlDoc.evaluate(xpath, xmlDoc, null, XPathResult.ANY_TYPE,null);
			var result = nodes.iterateNext();
			msgId = result.firstChild.nodeValue;
			this.msgIDget = msgId; // used later in isGetCommandFromServer
			var syncHdrStatus = new SyncMLStatus("SyncHdr",0,200,msgId,this.devId,this.syncUrl);
			this.statusList.push(syncHdrStatus);
		},
		
		checkServerAlerts: function(xmlDoc) {
			this.serverAlerts = {};
			var xpath = "/SyncML/SyncBody/Alert";
			var nodes = xmlDoc.evaluate(xpath, xmlDoc, null, XPathResult.ANY_TYPE,null);
			var result = nodes.iterateNext();
			while(result) {
				code = result.getElementsByTagName("Data").item(0).firstChild.nodeValue;
				cmdId = result.getElementsByTagName("CmdID").item(0).firstChild.nodeValue;
				items = result.getElementsByTagName("Item");
				for (var i=0; i<items.length; i++) {
					item = items.item(i);
					target = item.getElementsByTagName("Target").item(0);
					target = target.getElementsByTagName("LocURI").item(0).firstChild.nodeValue;
					this.serverAlerts[target] = code;
					this.logCallBack("The server alert code for " + target + "is " + code);
				}
				var alertStatus = new SyncMLStatus("Alert",cmdId, 200,1,this.source.name,this.source.remoteUri);
				this.statusList.push(alertStatus);
				result = nodes.iterateNext();
			}
		},
		
		getSourceAlertCode: function(serverSourceURI) {
			return this.serverAlerts[serverSourceURI];
		},
		
		/**
		* Checks if in the response from server a <Get> command is present and that
		* the information required by the server with this command is the device
		* capabilities
		*
		* @param response
		*            The SyncML message received from server
		* @return <code>true</code> if the <Get> tag is present in the message
		*         and the required information is the device capabilities
		*/
		isGetCommandFromServer: function(xmlDoc) {
			var getTags = xmlDoc.getElementsByTagName("Get");
			if (getTags.length == 0) {
				this.logCallBack("No <Get> command.");
				return false;
			}
			var get = getTags.item(0);
			var item = get.getElementsByTagName("Item").item(0);
			var target = item.getElementsByTagName("Target").item(0);
			var locUri = item.getElementsByTagName("LocURI").item(0).firstChild.nodeValue;
			this.cmdIDget = get.getElementsByTagName("CmdID").item(0).firstChild.nodeValue;
			if (locUri == "./devinf12") {
				return true;
			}
			return false;
		},
		
		prepareModificationMessage: function() {
			this.resetCmdID();
			var start = formatStartSyncML();
			var meta = formatMaxMsgSize(this.maxMsgSize);
			var syncHdr = formatSyncHeader(this.sessionID, this.getNextMsgID(),
				this.devId, this.syncUrl, meta);
			var startSyncBody = formatStartSyncBody();
			var msgIDRef = this.msgID - 1;
			var statusTags = this.createStatusTags;
			var mapTag = "";
			if (this.mappings.length > 0) {
				mapTag = formatMappings(this.getNextCmdId(),
					this.source.name,
					this.source.remoteUri,
					this.mappings);
				this.mappings = null;
				this.mappings = {};
			}
			var syncTag = "";
			if (this.state != 4) {
				synctag = this.prepareSyncTag(size);
			}
		},
		
		createStatusTags: function() {
			sb = new StringBuffer();
			var statusListLength = this.statusList.length;
			for (var i=0; i<statusListLength; i++) {
				var status = this.statusList[i];
				var cmdId = this.getNextCmdID();
				status.cmdId = cmdId;
				if (status.cmd == "Alert") {
					//sb.append(formatAlertStatus(status,this.source.getNextAnchor()));
					sb.append(formatAlertStatus(status,this.source.getNextAnchor()));
				} else if (status.cmd == "SyncHdr") {
					sb.append(formatSyncHdrStatus(status));
				} else {
					sb.append(formatItemStatus(status)); //todo: fixup
				}
			}
			this.statusList = null;
			this.statusList = [];
			return sb.toString();
		},
		
		prepareSyncTac: function(size) {
			sb = new StringBuffer;
			sb.append(formatStartSync());
			sb.append(formatSyncTagPreamble(getNextCmdID(), this.source.name,
				this.source.remoteUri));
			
		}
});
