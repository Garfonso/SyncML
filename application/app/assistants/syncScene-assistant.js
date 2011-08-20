function SyncSceneAssistant() {
	/* this is the creator function for your scene assistant object. It will be passed all the 
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
	  
	this.LogMessage = "";
	this.LogElement = null;
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
	this.LogElement = this.controller.get("logOutput");
	
	eventCallbacks.eventsUpdatedElement = this.controller.get("eventsUpdated");
	eventCallbacks.eventsUpdateFailedElement = this.controller.get("eventsUpdateFailed");
	eventCallbacks.eventsAddedElement = this.controller.get("eventsAdded");
	eventCallbacks.eventsAddFailedElement = this.controller.get("eventsAddFailed");
	eventCallbacks.eventsDeletedElement = this.controller.get("eventsDeleted");
	eventCallbacks.eventsDeleteFailedElement = this.controller.get("eventsDeleteFailed");
	eventCallbacks.log = this.log.bind(this);
	eventCallbacks.continueWithContacts = this.continueWithContacts.bind(this);
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
	
	if(account.deviceId === undefined)
	{
		this.controller.serviceRequest('palm://com.palm.preferences/systemProperties', {
			method:"Get",
			parameters:{"key": "com.palm.properties.nduid" },
			onSuccess: function(response){ account.deviceId = response["com.palm.properties.nduid"]; this.log("Got deviceId: " + account.deviceId)}.bind(this)
		});
	}
	
	this.checkAccount();
};

SyncSceneAssistant.prototype.checkAccount = function() 
{
	this.log("Check account");
	if(account.webOsAccountId !== undefined)
	{
		this.log("Have account Id: " + account.webOsAccountId);
		try {
			this.controller.serviceRequest('palm://com.palm.accounts/crud', {
				method: 'listAccounts',
				parameters: {},
				onSuccess: function(r){
					var i;
					var found = false;
					var accounts = r.list;
					for(i = 0; i < accounts.length; i++)
					{
						if(accounts[i].accountId === account.webOsAccountId)
						{
							found = true;
						}
					}
					
					if(found) 
					{
						this.log("Account is there.");
						eventCallbacks.checkCalendar();
					}
					else
					{
						this.log("Account not there, try to create it.");
						account.webOsAccountId = undefined;
						this.checkAccount();
					}
				}.bind(this),
				onFailur: function(error){ this.log("Something went very wrong: " + error + " - " + JSON.stringify(error));}.bind(this)
			});
		}
		catch(e)
		{
			this.log("Exception during get account..?? Try to recreate it.");
			account.webOsAccountId = undefined;
			eventCallbacks.checkAccount();
		}
	}
	else
	{	
		this.log("Need to create account.");
		var myDataTypes = [];
		if(account.syncCalendar)
		{
			myDataTypes.push("CALENDAR");
		}
		if(account.syncContacts)
		{
			myDataTypes.push("CONTACTS");
		}
		Mojo.Log.info(Mojo.appPath+"/icon32.png");
		
		this.controller.serviceRequest('palm://com.palm.accounts/crud', { 
			method: 'createAccount', 
			parameters: { 
				displayName: account.name,
				dataTypes: myDataTypes, 
				domain: account.name, 
				icons: {"32x32" : Mojo.appPath+"icon32.png", "48x48": Mojo.appPath+"icon48.png"}, 
				isDataReadOnly: false, 
				username: account.username 
			}, 
			onSuccess: function(accountId)
			{
				Mojo.Log.info("Created Account: " + Object.toJSON(accountId));
				account.webOsAccountId = accountId.accountId;
				saveConfig();
				eventCallbacks.checkCalendar();	
			}.bind(this), 
			onFailure: function(error)
			{
				Mojo.Controller.errorDialog("Could not create account. Can't sync. :(\n" + Object.toJSON(error));
			} 
		});  
	}
};

SyncSceneAssistant.prototype.continueWithContacts = function()
{
};

var modes = {	"two-way":             200, // TWO-WAY Specifies a client-initiated, two-way synchronization. 
				"slow":                201, // SLOW SYNC Specifies a client-initiated, two-way slow-synchronization. 
				"one-way-from-client": 202, // ONE-WAY FROM CLIENT Specifies the client-initiated, one-way only synchronization from the client to the server. 
				"refresh-from-client": 203, // REFRESH FROM CLIENT Specifies the client-initiated, refresh operation for the oneway only synchronization from the client to the server. 
				"one-way-from-server": 204, // ONE-WAY FROM SERVER Specifies the client-initiated, one-way only synchronization from the server to the client. 
				"refresh-from-server": 205 // REFRESH FROM SERVER Specifies the client-initiated, refresh operation of the one-way only synchronization from the server to the client. 
	};


SyncSceneAssistant.prototype.startSync = function()
{
	this.controller.get("btnStart").mojo.activate();
	syncSource = new SyncSource({
			name: 'calendar',
			type: 'text/calendar',
			encoding: 'none',
			remoteUri: account.syncCalendarPath,
			syncMode: modes[account.syncCalendarMethod],
			lastAnchor: 0
	});
	syncSource.logCallback = this.log.bind(this);
	syncManager = new SyncManager(account.url, account.username, account.password, account.deviceId);
	syncManager.setLogCallback(this.log.bind(this));
	syncManager.setErrorCallback(this.log.bind(this));
	syncManager.sync(syncSource,modes[account.syncCalendarMethod],false);
	
	if (account.syncCalendar) {
		eventCallbacks.finishSync(true);
	}
	if (account.syncContacts) {
		if (account.syncContactsMethod === "slow" || account.syncContactsMethod.indexOf("refresh") !== -1) {
			account.syncContactsMethod = "two-way";
		}
	}
	saveConfig();
	this.controller.get("btnStart").mojo.deactivate();
};

SyncSceneAssistant.prototype.finished = function(calOk,conOk)
{
	if(account.syncCalendar)
	{
		if(calOk === "ok")
		{
			this.log("Calendar sync worked.");
			eventCallbacks.finishSync(true);
		}
		else
		{
			this.log("Calendar sync had errors.");
			//account.syncCalendarMethod = "slow";
		}
	}
	if(account.syncContacts)
	{
		if(conOk === "ok")
		{
			this.log("Contacts sync worked.");
			//TODO: call doneWithChanges!
		
			if (account.syncContactsMethod === "slow" || account.syncContactsMethod.indexOf("refresh") !== -1) {
				account.syncContactsMethod = "two-way";
			}
		}
		else
		{
			this.log("Contacts sync had errors.");
			//account.syncContactsMethod = "slow";
		}
	}
	
	this.controller.get("btnStart").mojo.deactivate();
};

SyncSceneAssistant.prototype.log = function(message)
{
	this.LogMessage = "<p>" + message + "</p>" + this.LogMessage;
	this.LogElement.innerHTML = this.LogMessage;
	Mojo.Log.info(message);
};

SyncSceneAssistant.prototype.activate = function(event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
};

SyncSceneAssistant.prototype.deactivate = function(event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
	saveConfig();
};

SyncSceneAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};
