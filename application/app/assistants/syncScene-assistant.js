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
	setTimeout(this.startSync.bind(this),100);
};

SyncSceneAssistant.prototype.startSync = function ()
{	
  if (this.locked) {
    log("Sync already running. Correct?");
    return;
  }
  this.controller.get("btnStart").mojo.activate();
  
  var getResult = function (f) {
    log(f.result.msg);
    logStatus(this.controller, f.result.msg);

    if (f.result.finalResult) {
      //sync finished.
      if (f.result.returnValue) {
        logStatus("Sync returned ok");
        var es = f.result.account.datastores.calendar;
        if (es.deleteFromServerFail) {
          log("Deletes on client FAILED: " + es.deleteFromServerFail);
        }
        if (es.updateFromServerFail) {
          log("Updates on client FAILED: " + es.updateFromServerFail);
        }
        if (es.addFromServerFail) {
          log("Adds    on client FAILED: " + es.addFromServerFail);
        }
        log("Deletes on client: " + es.deleteFromServer);
        log("Updates on client: " + es.updateFromServer);
        log("Adds    on client: " + es.addFromServer);
        log("Deletes on server: " + es.delOwn);
        log("Updates on server: " + es.replaceOwn);
        log("Adds    on server: " + es.addOwn);
        log("Stats for calendar:");
      } else {
        logStatus("Sync returned with error.");
      }
      this.controller.get("btnStart").mojo.deactivate();
      this.locked = false;
    } else {
      f.then(this, getResult);
    }
  };
  
  try {
    this.lockded = true;
    var account = accounts[currentAccount];
    account.subscribe = true;
    PalmCall.call("palm://info.mobo.syncml.client.server", "sync", account).then(this, getResult);
  } catch (e) { 
    log("Error: " + e.name + " what: " + e.message + " - " + e.stack); 
    this.locked = false; 
  }
};

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
};

SyncSceneAssistant.prototype.cleanup = function (event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};
