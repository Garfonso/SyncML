function SyncSceneAssistant() {
	/* this is the creator function for your scene assistant object. It will be passed all the 
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
}

SyncSceneAssistant.prototype.setup = function() {
	/* this function is for setup tasks that have to happen when the scene is first created */
		
//		var icalText = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//eGroupWare//NONSGML eGroupWare Calendar 1.9.002//DE\nMETHOD:PUBLISH\nBEGIN:VTIMEZONE\nTZID:Europe/Berlin\nX-LIC-LOCATION:Europe/Berlin\nBEGIN:DAYLIGHT\n";
//		icalText += "TZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nTZNAME:CEST\nDTSTART:19700329T020000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:+0200\n";
//		icalText += "TZOFFSETTO:+0100\nTZNAME:CET\nDTSTART:19701025T030000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\nEND:STANDARD\nEND:VTIMEZONE\nBEGIN:VEVENT\nCLASS:PUBLIC\nSUMMARY:TEEEEEEEEESTöööööäääüüü!!!!$§$\"!$%%<<<>>>\n";
//		icalText += "DESCRIPTION:dfjasdfÃ¶sksldkfsdlkfÃ¶ajsdfdkllkj\\n\\nKomische Ausnahme..\nLOCATION:12321312\nDTSTART;TZID=Europe/Berlin:20110225T130000\nDTEND;TZID=Europe/Berlin:20110225T150000\n";
//		icalText += "ATTENDEE;CN=Nutzer\n  Group;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CUTYPE=GROUP;RSVP=FALSE;X-EGR\n OUPWARE-UID=-8:\nATTENDEE;CN=Achim\n  Königs;ROLE=CHAIR;PARTSTAT=ACCEPTED;CUTYPE=INDIVIDUAL;EMAIL=achim@tratscht\n";
//		icalText += " ante.de;X-EGROUPWARE-UID=6:MAILTO:achim@tratschtante.de\nATTENDEE;CN=Stephanie\n  Lohner;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CUTYPE=INDIVIDUAL;RSVP=FALSE\n";
//		icalText += " ;EMAIL=Stephanie@power-wusel.de;X-EGROUPWARE-UID=7:MAILTO:Stephanie@power-w\n usel.de\nATTENDEE;CN=Andrea\n  Wensing;ROLE=REQ-PARTICIPANT;PARTSTAT=DECLINED;CUTYPE=INDIVIDUAL;RSVP=FALS\n";
//		icalText += " E;EMAIL=ooreo@gmx.de;X-EGROUPWARE-UID=c307:MAILTO:ooreo@gmx.de\n\ORGANIZER;CN=Achim Königs;X-EGROUPWARE-UID=6:MAILTO:achim@tratschtante.de\n";
//		icalText += "PRIORITY:1\nTRANSP:OPAQUE\nCATEGORIES:Geburtstag,Mögliche Aktivitäten,Geplante Aktivitäten,Konflikt\nCREATED:20110215T204618Z\nLAST-MODIFIED:20110215T204618Z\n";
//		icalText += "DTSTAMP:20110224T223310Z\nEND:VEVENT\nEND:VCALENDAR\n";
//		
//		//this.log("icalText: " + icalText);
//		var icalEvent = parseICalToEvent(icalText);
//		this.log("iCal Object: " + JSON.stringify(icalEvent));
//		this.log("iCal: " + makeICal(icalEvent));
		//throw "blabla";
	this.oldLog = log;
	log = logGUI.bind(this,this.controller);
	
	eventCallbacks.eventsUpdatedElement = this.controller.get("eventsUpdated");
	eventCallbacks.eventsUpdateFailedElement = this.controller.get("eventsUpdateFailed");
	eventCallbacks.eventsAddedElement = this.controller.get("eventsAdded");
	eventCallbacks.eventsAddFailedElement = this.controller.get("eventsAddFailed");
	eventCallbacks.eventsDeletedElement = this.controller.get("eventsDeleted");
	eventCallbacks.eventsDeleteFailedElement = this.controller.get("eventsDeleteFailed");
	//eventCallbacks.log = log.bind(this);
	eventCallbacks.controller = this.controller;

	/* use Mojo.View.render to render view templates and add them to the scene, if needed */
	
	/* setup widgets here */
	this.controller.setupWidget("btnStart", { type : Mojo.Widget.activityButton }, { label: $L("Start sync")});
	
	/* add event handlers to listen to events from widgets */
	Mojo.Event.listen(this.controller.get("btnStart"),Mojo.Event.tap,this.startSync.bind(this));	
	
	/*try {
		cPlugin.setup(this.controller.get("webOsSyncMLPlugin"));
		cPlugin.thePluginObject.updateStatus = SyncSceneAssistant.prototype.log.bind(this);
		cPlugin.thePluginObject.finished = SyncSceneAssistant.prototype.finished.bind(this);
	}
	catch(e)
	{
		this.log("Error" + e + " - " + JSON.stringify(e));
	}*/
	
	if(!DeviceProperties.devID) //TODO: make sure this get's in before sync and move it into service..
	{
		this.controller.serviceRequest('palm://com.palm.preferences/systemProperties', {
			method:"Get",
			parameters:{"key": "com.palm.properties.nduid" },
			onSuccess: function(response){ DeviceProperties.devID = response["com.palm.properties.nduid"]; log("Got deviceId: " + DeviceProperties.devID); }
		});
	}
	
	this.checkAccount();
};

SyncSceneAssistant.prototype.checkAccount = function() 
{
	log("Check account");
	if (account.webOsAccountId !== undefined) {
		log("Have account Id: " + account.webOsAccountId);
		account.getAccountInfo(function(){ eventCallbacks.checkCalendar();}, 
		function(){
			log("No account..");
			account.webOsAccountId = undefined;
			this.checkAccount();
		}.bind(this));
	}
	else {
		log("Need to create account.");
		account.createAccount(function(){ eventCallbacks.checkCalendar();});
	}
};

SyncSceneAssistant.prototype.startSync = function()
{
/*	this.controller.get("btnStart").mojo.activate();
	syncSource = new SyncSource({
			name: 'calendar',
			type: 'text/calendar',
			encoding: 'none',
			remoteUri: account.syncCalendarPath,
			syncMode: modes[account.syncCalendarMethod],
			lastAnchor: 0
	});
	syncSource.logCallback = log.bind(this);
	log("==== Creating SyncManager");
	syncManager = new SyncManager(account.url, account.username, account.password, account.deviceId);
	log("==== Created SyncManager");
	syncManager.setLogCallback(log.bind(this));
	syncManager.setErrorCallback(log.bind(this));
	log("==== Calling syncManager.sync");
	syncManager.sync(syncSource,modes[account.syncCalendarMethod],false);
	log("==== syncManager.sync returned!");*/
	
	//this needs to happen in finished.
	/*
	if (account.syncCalendar) {
		eventCallbacks.finishSync(true);
	}
	if (account.syncContacts) {
		if (account.syncContactsMethod === "slow" || account.syncContactsMethod.indexOf("refresh") !== -1) {
			account.syncContactsMethod = "two-way";
		}
	}
	account.saveConfig();
	this.controller.get("btnStart").mojo.deactivate();*/
	
  if(this.locked){
    log("Sync already running. Correct?");
    return;
  }
  
  //try{
    this.lockded = true;
    log("Starting...");
    SyncML.initialize(account);
    log("syncer initialized.");
    log("=== Trying to call sendSyncInitializationMsg.");

    var checkCredCallback = function(result) { log("CheckCredentials came back: " + JSON.stringify(result)); this.locked = false; this.controller.get("btnStart").mojo.deactivate(); }.bind(this);

    SyncML.sendSyncInitializationMsg(checkCredCallback);
  //} catch (e) { log("Error: " + e.name + " what: " + e.message + " - " + e.stack); this.locked = false; }
};

SyncSceneAssistant.prototype.finished = function(calOk,conOk)
{
	if(account.syncCalendar)
	{
		if(calOk === "ok")
		{
			log("Calendar sync worked.");
			eventCallbacks.finishSync(true);
		}
		else
		{
			log("Calendar sync had errors.");
			//account.syncCalendarMethod = "slow";
		}
	}
	if(account.syncContacts)
	{
		if(conOk === "ok")
		{
			log("Contacts sync worked.");
			//TODO: call doneWithChanges!
		
			if (account.syncContactsMethod === "slow" || account.syncContactsMethod.indexOf("refresh") !== -1) {
				account.syncContactsMethod = "two-way";
			}
		}
		else
		{
			log("Contacts sync had errors.");
			//account.syncContactsMethod = "slow";
		}
	}
	
	account.saveConfig();
	this.controller.get("btnStart").mojo.deactivate();
};

/*SyncSceneAssistant.prototype.log = function(message)
{
	this.LogMessage = "<p>" + message + "</p>" + this.LogMessage;
	this.LogElement.innerHTML = this.LogMessage;
	Mojo.Log.info(message);
};*/

SyncSceneAssistant.prototype.activate = function(event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
};

SyncSceneAssistant.prototype.deactivate = function(event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
	log = this.oldLog;
	account.saveConfig();
};

SyncSceneAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};
