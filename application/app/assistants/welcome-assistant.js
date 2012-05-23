//JSLint options:
/*global log, $L, DeviceProperties, Mojo, SyncMLAccount, KeyManager */
function WelcomeAssistant() {
	/* this is the creator function for your scene assistant object. It will be passed all the 
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
}

WelcomeAssistant.prototype.setup = function () {
  var configModel = {label: $L("Configure"), disabled: true};
  var startSyncModel = {label: $L("Start sync"), disabled: true};
  
  PalmCall.call("palm://info.mobo.syncml.client.service", "getAccounts", {}).then(this, function (f){
    if (f.result.returnValue === true) {
      log("Got accounts.");
      accounts = f.result.accounts;
      log("Now have " + accounts.length + " accounts.");
      if (accounts.length > 0) {
        currentAccount = 0;
      }
      this.initialized = true;
      configModel.disabled = false;
      startSyncModel.disabled = false;
      this.controller.modelChanged(configModel);
      this.controller.modelChanged(startSyncModel);
      this.refreshAccounts();
      log("Ready to go.");
    } else {
      log("Could not get accounts..." + JSON.stringify(f.result));
    }
  });
  
  this.controller.setupWidget(Mojo.Menu.appMenu, {}, AppAssistant.prototype.MenuModel);
  	
	/* setup widgets here */
	this.controller.setupWidget("btnConfig", {}, configModel);
	this.controller.setupWidget("btnStartSync", {}, startSyncModel);

	this.dropboxModel = {value: -1, choices: [ {label: $L("New"), value: -1}], disabled: true };
	this.dropBox = this.controller.setupWidget("lsAccounts", {label: $L("Account")}, this.dropboxModel);
	
	/* add event handlers to listen to events from widgets */
	Mojo.Event.listen(this.controller.get("btnConfig"), Mojo.Event.tap, this.pushConfig.bind(this));
	Mojo.Event.listen(this.controller.get("btnStartSync"), Mojo.Event.tap, this.startSync.bind(this));
};

WelcomeAssistant.prototype.pushConfig = function (event) {
  log("Selecting account " + this.dropboxModel.value);
  currentAccount = this.dropboxModel.value;
	this.controller.stageController.pushScene("configSyncMLAccount");
};

WelcomeAssistant.prototype.startSync = function (event) {
  log("Selecting account " + this.dropboxModel.value);
  currentAccount = this.dropboxModel.value;
  if (currentAccount != -1) {
    this.controller.stageController.pushScene("syncScene");
  } else {
    this.controller.showAlertDialog({
      title: $L("Error"),
      message: "You need to configure an account first.",
      choices: [{label:$L("OK"), value:"OK"}]
    });
  }
};

WelcomeAssistant.prototype.refreshAccounts = function () {
  var oldValue = this.dropboxModel.value;
  this.dropboxModel.choices = [{label: $L("New"), value: -1}];
  var addToDropbox = function (result) {
    log("Got account: " + result.name + " = " + result.index);
    this.dropboxModel.choices.push({label: result.name, value: result.index});
    if (oldValue === -1 || oldValue >= accounts.length) {
      oldValue = result.index;
    }
    this.dropboxModel.value = oldValue;
    this.dropboxModel.disabled = false;
    this.controller.modelChanged(this.dropboxModel);
    log("added account");
  }.bind(this);
  
  for(var i = 0; i < accounts.length; i += 1) {
    addToDropbox(accounts[i]);
  }
};

WelcomeAssistant.prototype.activate = function (event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
  if (this.initialized) {
    this.refreshAccounts();
  }
};

WelcomeAssistant.prototype.deactivate = function (event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
};

WelcomeAssistant.prototype.cleanup = function (event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};
