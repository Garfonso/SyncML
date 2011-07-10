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
//		//log("icalText: " + icalText);
//		var icalEvent = parseICalToEvent(icalText);
//		log("iCal Object: " + JSON.stringify(icalEvent));
//		log("iCal: " + makeICal(icalEvent));
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
	
	try {
		cPlugin.setup(this.controller.get("webOsSyncMLPlugin"));
		cPlugin.thePluginObject.updateStatus = log.bind(this,this.controller);
		cPlugin.thePluginObject.finished = SyncSceneAssistant.prototype.finished.bind(this);
	}
	catch(e)
	{
		log("Error" + e + " - " + JSON.stringify(e));
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
	try
	{
		var doCal = 0;
		var doCon = 0;
		if(account.syncCalendar)
		{
			doCal = 1;
		}
		if(account.syncContacts)
		{
			doCon = 1;
		}
		var result = cPlugin.thePluginObject.startSync(account.username,account.password,account.url,doCal,
		                                        doCon,account.syncCalendarPath,account.syncCalendarMethod,account.syncContactsPath,account.syncContactsMethod);

		this.controller.get("btnStart").mojo.activate();

		if ( result === null )
		{
			log("result is null");
		}
		else
		{
			log("result: " + result);
		}
	}
	catch(e)
	{
		log("exception: "+e);
	}
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
	
	this.controller.get("btnStart").mojo.deactivate();
};

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
