//JSLint options:
/*global log, logGUI, Mojo, $L, eventCallbacks, SyncMLAccount, SyncML */
function SyncSceneAssistant() {
	/* this is the creator function for your scene assistant object. It will be passed all the 
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
}

SyncSceneAssistant.prototype.setup = function () {
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
	log = logGUI.bind(this, this.controller);
	this.oldStatus = logStatus;
	logStatus = logStatus.bind(this, this.controller);
	
	//setup menu with email log:
  this.model = { visible: true, items: [ {label: $L("E-Mail Log"), command: "do-log-email" }] };
  this.controller.setupWidget(Mojo.Menu.appMenu, { omitDefaultItems: true }, this.model);
	
	/* use Mojo.View.render to render view templates and add them to the scene, if needed */
	
	/* setup widgets here */
  var buttonModel = { disabled: true, label: $L("Start sync") };
	this.controller.setupWidget("btnStart", { type : Mojo.Widget.activityButton }, buttonModel );
	
	/* add event handlers to listen to events from widgets */
	Mojo.Event.listen(this.controller.get("btnStart"), Mojo.Event.tap, this.startSync.bind(this));
	var init = function () {
	  log("Init-sync start");
	  this.checkAccount().then(function (f) {
	    if (f.result && f.result.returnValue) {
        buttonModel.disabled = false;
        this.initialized = true;
        this.controller.modelChanged(buttonModel);
        this.startSync();
      }
	  }.bind(this));
	};
	setTimeout(init.bind(this),100);
};

SyncSceneAssistant.prototype.checkAccount = function () {
  var account = SyncMLAccount.getAccount(), future = new Future();
	log("Check account");
	if (account.accountId !== undefined) {
		log("Have account Id: " + account.accountId);
		SyncMLAccount.getAccountInfo(account, function (result) {
		  if (result.account && result.account.accountId) {
		    eventCallbacks.checkCalendar(result.account).then(function (f) {
		      future.result = f.result;
		    });
		  } else {
		    this.checkAccount().then(function (f) {
		      future.result = f.result;
		    }); //try to create account.
		  }
		});
	} else {
		log("Need to create account.");
		SyncMLAccount.createAccount(account, function(acc) {
		  eventCallbacks.checkCalendar(acc).then(function (f) {
		    future.result = f.result;
		  });
		});
	}
	return future;
};

SyncSceneAssistant.prototype.startSync = function ()
{	
  var account, checkCredCallback;
  if (this.locked) {
    log("Sync already running. Correct?");
    return;
  }
  if (this.initialized !== true) {
    log("Not yet initialized, please be patient or report error.");
    return;
  }
  this.controller.get("btnStart").mojo.activate();
  
  /*var iCals = [
               "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//eGroupWare//NONSGML eGroupWare Calendar 1.9.003//DE\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nCLASS:PUBLIC\r\nSUMMARY:Test-Termin\r\nDESCRIPTION:Test Beschreibung.\\n\\n...\\nblub\\näöüÜÄÖ\r\nLOCATION:Test-OrtÄÖÜ\r\nDTSTART:20111230T080000Z\r\nDTEND:20111230T090000Z\r\nORGANIZER;CN=\"SyncMLTest\r\n  User\";X-EGROUPWARE-UID=11:MAILTO:SyncMLTest@moses.redirectme.net\r\nRRULE:FREQ=DAILY;INTERVAL=3\r\nEXDATE;VALUE=DATE-TIME:20120105T080000Z,20120111T080000Z\r\nPRIORITY:5\r\nTRANSP:OPAQUE\r\nCATEGORIES:Mögliche Aktivitäten\r\nUID:calendar-2306-1021f558a5067cf68a9d362d4fc5d77d\r\nSEQUENCE:8\r\nCREATED:20110820T090645Z\r\nLAST-MODIFIED:20111230T111058Z\r\nDTSTAMP:20111230T111311Z\r\nEND:VEVENT\r\nEND:VCALENDAR",
               "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//eGroupWare//NONSGML eGroupWare Calendar 1.9.003//DE\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20111231\r\nDTEND;VALUE=DATE:20120101\r\nCLASS:PUBLIC\r\nSUMMARY:Test-Ganztag\r\nLOCATION:Test-beschreibung\r\nORGANIZER;CN=\"SyncMLTest\r\n  User\";X-EGROUPWARE-UID=11:MAILTO:SyncMLTest@moses.redirectme.net\r\nPRIORITY:9\r\nTRANSP:TRANSPARENT\r\nUID:calendar-2307-1021f558a5067cf68a9d362d4fc5d77d\r\nCREATED:20111229T170256Z\r\nLAST-MODIFIED:20111229T170256Z\r\nDTSTAMP:20111230T111311Z\r\nEND:VEVENT\r\nEND:VCALENDAR",
               "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//eGroupWare//NONSGML eGroupWare Calendar 1.9.003//DE\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nCLASS:PUBLIC\r\nSUMMARY:Test-Termin-Ausnahme\r\nDESCRIPTION:Test Beschreibung.\\n\\n...\\nblub\\näöüÜÄÖ\\nAusnahme\r\nLOCATION:Test-OrtÄÖÜ-Ausnahme-Ort\r\nDTSTART:20120106T090000Z\r\nDTEND:20120106T100000Z\r\nORGANIZER;CN=\"SyncMLTest\r\n  User\";X-EGROUPWARE-UID=11:MAILTO:SyncMLTest@moses.redirectme.net\r\nPRIORITY:5\r\nTRANSP:OPAQUE\r\nCATEGORIES:Mögliche Aktivitäten\r\nUID:calendar-2306-1021f558a5067cf68a9d362d4fc5d77d\r\nRECURRENCE-ID:20120105T080000Z\r\nSEQUENCE:6\r\nCREATED:20110820T090645Z\r\nLAST-MODIFIED:20111230T111045Z\r\nDTSTAMP:20111230T111311Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
               "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//eGroupWare//NONSGML eGroupWare Calendar 1.9.003//DE\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nCLASS:PUBLIC\r\nSUMMARY:Test-Termin\r\nDESCRIPTION:Test Beschreibung.\\n\\n...\\nblub\\näöüÜÄÖ-_.\\,.\\;:|<>{}[]()/\\\\^\\n\r\nLOCATION:Test-OrtÄÖÜ\r\nDTSTART:20121230T080000Z\r\nDTEND:20121230T090000Z\r\nATTENDEE;CN=NoGroup\r\n  Group;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CUTYPE=GROUP;RSVP=TRUE;X-\r\n EGROUPWARE-UID=-3:\r\nATTENDEE;CN=SyncMLTest\r\n  User;ROLE=CHAIR;PARTSTAT=ACCEPTED;CUTYPE=INDIVIDUAL;EMAIL=SyncMLTest@moses\r\n .redirectme.net;X-EGROUPWARE-UID=11:MAILTO:SyncMLTest@moses.redirectme.net\r\nORGANIZER;CN=SyncMLTest\r\n  User;X-EGROUPWARE-UID=11:MAILTO:SyncMLTest@moses.redirectme.net\r\nRRULE:FREQ=DAILY;INTERVAL=3\r\nPRIORITY:5\r\nTRANSP:OPAQUE\r\nCATEGORIES:Mögliche Aktivitäten\r\nUID:calendar-2218-1021f558a5067cf68a9d362d4fc5d77d\r\nSEQUENCE:3\r\nCREATED:20110820T090645Z\r\nLAST-MODIFIED:20111229T005535Z\r\nDTSTAMP:20111229T014310Z\r\nBEGIN:VALARM\r\nTRIGGER;VALUE=DURATION;RELATED=START:-PT3H\r\nACTION:DISPLAY\r\nDESCRIPTION:Test-Termin\r\nEND:VALARM\r\nBEGIN:VALARM\r\nTRIGGER;VALUE=DATE-TIME:20121230T070000Z\r\nACTION:DISPLAY\r\nDESCRIPTION:TEST\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
               ];
  for (var i = 0; i < iCals.length; i += 1) {
  //var i = 0;
    log("Parsing iCal " + i);
    var event = iCal.parseICal(iCals[i]);
    log("Finished!");
    log(JSON.stringify(event));
    log("Reversing operation: ");
    var content = iCal.generateICal(event);
    log(content);
  }
  return;*/
  
  /*var events = [
                { 
                  calendarId: account.webOsCalendarId,
                  _kind: "info.mobo.syncml.calendarevent:1", //go into right calendar.
                  subject: "allday-test-1",
                  dtstart: 1325462400000,
                  dtend: 1325462400000,
                  allDay: true
                },
                { 
                  calendarId: account.webOsCalendarId,
                  _kind: "info.mobo.syncml.calendarevent:1", //go into right calendar.
                  subject: "allday-test-2",
                  dtstart: 1325462400000,
                  dtend: 1325548800000,
                  allDay: true
                },
                { 
                  calendarId: account.webOsCalendarId,
                  _kind: "info.mobo.syncml.calendarevent:1", //go into right calendar.
                  subject: "allday-test-3",
                  dtstart: 1325462400000,
                  dtend: 1325548799000,
                  allDay: true
                }
                ];
  
  DB.put(events).then(
    function (future) {
      var r = future.result;
      if (r.returnValue === true) {
        eventAdded += 1;
        if (this.eventsAddedElement) {
          this.eventsAddedElement.innerHTML = eventAdded;
        }
        e[0]._id = r.results[0].id;
        input.localId = r.results[0].id;
        input.success = true;
        if (recId || recId === 0) {
          if (!recurringEventIds[recId]) {
            recurringEventIds[recId] = { counter: 0, id: e[0]._id };
          } else {
            recurringEventIds[recId].id = e[0]._id;
          }
        }
      } else {
        eventAddFailed += 1;
        if (this.eventsAddFailedElement) {
          this.eventsAddFailedElement.innerHTML = eventAddFailed;
        }
        try {
          log("Callback not successfull: " + JSON.stringify(future.exception.error) + ". at - " + input.item + " = " + JSON.stringify(e));
        } catch (exception) {
          log("Callback not successfull: " + JSON.stringify(future.exception));
        }
        input.success = false;
      }
      input.callback(input);
    }
  );*/
 
  
  try {
    this.lockded = true;
    log("Starting...");
    account = SyncMLAccount.getAccount();
    delete account.datastores.contacts; //be sure to not sync contacts, yet.
    eventCallbacks.setAccountAndDatastoreIds({accountId: account.accountId, calendarId: account.datastores.calendar.dbId});
    eventCallbacks.setRevisions({calendar: account.datastores.calendar.lastRev || 0});
    SyncML.initialize(account);
    SyncML.setCallbacks([
      {
        name: "calendar",
        //needs to get all calendar data and call callback with { update: [ all data here ] }, callback
        getAllData: eventCallbacks.getAllEvents,
        //needs to get only new calendar data and call callback with { update: [modified], add: [new], del: [deleted] }, callback
        getNewData: eventCallbacks.getNewEvents,
        //this will be called on refresh from server to delete all local data. Call callback with {}.
        deleteAllData: eventCallbacks.deleteAllEvents,
        //Param: {type: add, callback, globalId: ..., item: new item data }. call callback with {type: add, globalId: ..., localId: ... success: true/false }
        newEntry: eventCallbacks.createEvent,
        //Param: {type: update, callback, localId: ..., item: new data }. Call callback with { type: update, globalId: ..., localId: ... success: true/false }.
        updateEntry: eventCallbacks.updateEvent,
        //Param: { type: del, callback, localId: ... }. Call callback with { type: del, globalId: ..., localId: ... success: true/false }. 
        delEntry: eventCallbacks.deleteEvent
      }
    ]
    );
    log("syncer initialized.");
    log("=== Trying to call sendSyncInitializationMsg.");
    
    checkCredCallback = function (result) { 
      log("CheckCredentials came back.");
      log("result: " + (result ? result.success : "failure?"));
      //log(JSON.stringify(result));
      if (result.success && result.account) {
        this.finished(result.account);
      } else {
        var account = SyncMLAccount.getAccount();
        if (account.datastores.calendar.method !== "one-way-from-server" && account.datastores.calendar.method !== "one-way-from-client") {
          //account.datastores.calendar.method = "slow"; let server do that.
          SyncMLAccount.setAccount(result.account);
          SyncMLAccount.saveConfig(); //on errors save that we want to do slow sync next time. :(
        }
      }
      this.locked = false; 
      this.controller.get("btnStart").mojo.deactivate(); 
    }.bind(this);
    
    //eventCallbacks.getAllEvents(checkCredCallback);
    SyncML.sendSyncInitializationMsg(checkCredCallback);
  } catch (e) { 
    log("Error: " + e.name + " what: " + e.message + " - " + e.stack); 
    this.locked = false; 
  }
};

SyncSceneAssistant.prototype.finished = function (account)
{
  var calendar, contacts;
	if (account.datastores.calendar) {
	  calendar = account.datastores.calendar;
		if (calendar.ok === true)
		{
			log("Calendar sync worked.");
      //keep changes for next two-way.
      eventCallbacks.finishSync(account, true);
			if (calendar.method === "slow" || calendar.method.indexOf("refresh") !== -1) {
        calendar.method = "two-way";
      }
		}
		else
		{
			log("Calendar sync had errors.");
			calendar.method = "slow";
		}
	}
	if (account.datastores.contacts) {
	  contacts = account.datastores.contacts;
		if (contacts.ok) {
			log("Contacts sync worked.");
			//TODO: call doneWithChanges!
		
			if (contacts.method === "slow" || contacts.method.indexOf("refresh") !== -1) {
				contacts.method = "two-way";
			}
		} else {
			log("Contacts sync had errors.");
			contacts.method = "slow";
		}
	}
	
	SyncMLAccount.setAccount(account);
	SyncMLAccount.saveConfig();
	this.controller.get("btnStart").mojo.deactivate();
};

/*SyncSceneAssistant.prototype.log = function(message)
{
	this.LogMessage = "<p>" + message + "</p>" + this.LogMessage;
	this.LogElement.innerHTML = this.LogMessage;
	Mojo.Log.info(message);
};*/

function email(subject, message)
{

  var request = new Mojo.Service.Request("palm://com.palm.applicationManager",
  {
    method: 'open',
    parameters:
    {
      id: 'com.palm.app.email',
      params:
      {
        'summary':  subject,
        'text':   '<html><body>' + message + '</body></html>'
      }
    }
  });
  return request;
}

function formatForHtml(string) {
  //string = string.escapeHTML();
  //string = string.replace(/[\s]{2}/g, " &nbsp;");
  return string;
}

SyncSceneAssistant.prototype.handleCommand = function (event) {
  if (event.type === Mojo.Event.command && event.command === "do-log-email") {
    var text = 'Here is the log from SyncML:<br /><br />';
    this.out = this.controller.get("logOutput");
    log("output: " + this.out);
    text += formatForHtml(this.out.innerHTML);
    email('Log for SyncML', text);
  }
};

SyncSceneAssistant.prototype.activate = function (event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
};

SyncSceneAssistant.prototype.deactivate = function (event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
	log = this.oldLog;
	logStatus = this.oldStatus;
	SyncMLAccount.saveConfig();
};

SyncSceneAssistant.prototype.cleanup = function (event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};
