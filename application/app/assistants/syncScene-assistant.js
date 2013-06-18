//JSLint options:
/*global PalmCall, log, logStatus, AppAssistant, logGUI, Mojo, $L, accounts, currentAccount */
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

	
	this.controller.setupWidget(Mojo.Menu.appMenu, {}, AppAssistant.prototype.MenuModel);
	
	/* use Mojo.View.render to render view templates and add them to the scene, if needed */
	  
	/* setup widgets here */
  this.buttonModel = { disabled: true, label: $L("Start sync") };
	this.controller.setupWidget("btnStart", { type : Mojo.Widget.activityButton }, this.buttonModel );
  
	/* add event handlers to listen to events from widgets */
	Mojo.Event.listen(this.controller.get("btnStart"), Mojo.Event.tap, this.startSync.bind(this));
	setTimeout(this.startSync.bind(this),100);
};

SyncSceneAssistant.prototype.printStats = function(name, es) {
  if (es.deleteFailed) {
    log("Deletes on client FAILED: " + es.deleteFailed);
  }
  if (es.updateFailed) {
    log("Updates on client FAILED: " + es.updateFailed);
  }
  if (es.addFailed) {
    log("Adds    on client FAILED: " + es.addFailed);
  }
  log("Deletes on client: " + es.deleteOK);
  log("Updates on client: " + es.updateOK);
  log("Adds    on client: " + es.addOK);
  log("Deletes on server: " + es.delOwn);
  log("Updates on server: " + es.replaceOwn);
  log("Adds    on server: " + es.addOwn);
  log("Stats for " + name + ":");
};

SyncSceneAssistant.prototype.startSync = function ()
{	
  if (this.locked) {
    log("Sync already running. Correct?");
    return;
  }
  this.controller.get("btnStart").mojo.activate();
  this.buttonModel.disabled = true;
  this.controller.modelChanged(this.buttonModel);
  
  var oldMsg = "", future, account, keepInTouch,
    getResult = function (f) {
		if (f.result) {
			if (f.result.account) {
				if (f.result.account.datastores.calendar.enabled) {
					this.printStats("Calendar", f.result.account.datastores.calendar.stats);
				}
				if (f.result.account.datastores.contacts.enabled) {
					this.printStats("Contacts", f.result.account.datastores.contacts.stats);
				}
			}
		
			if (f.result.finalResult) {
				//log("FINAL RESULT!!");
				log(oldMsg);
				//sync finished.
				if (f.result.success) {
					logStatus("Sync returned ok");
				} else {
					logStatus("Sync returned with error.");
				}
				this.controller.get("btnStart").mojo.deactivate();
				this.buttonModel.disabled = false;
				this.controller.modelChanged(this.buttonModel);
				this.locked = false;
				log("Canceling futures: ");
				f.cancel();
				PalmCall.cancel(future);
				log("Ok.");
			} else {
				f.then(this, getResult);
			}
			
			if (f.result.msg) {
				log(oldMsg);
				oldMsg = f.result.msg;
				logStatus(f.result.msg);
			}

			if (f.result.reason) {
				log(f.result.reason);
				logStatus(f.result.reason);
			}
		}
  };
      
  try {
    this.locked = true;
    account = accounts[currentAccount];
    account.subscribe = true;
    log("Calling service.");
    future = PalmCall.call("palm://info.mobo.syncml.client.service/", "sync", account);
    future.then(this, getResult);
    keepInTouch = function () {
      if (this.locked) {
        future.then(this, getResult);
        setTimeout(keepInTouch.bind(this), 10);
      }
    };
    setTimeout(keepInTouch.bind(this), 10);
  } catch (e) { 
    log("Error: " + e.name + " what: " + e.message + " - " + e.stack); 
    this.locked = false; 
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
