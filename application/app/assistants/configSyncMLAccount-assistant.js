//JSLint options:
/*global log, $L, SyncMLAccount, Mojo, eventCallbacks */
function ConfigSyncMLAccountAssistant(params) {
	/* this is the creator function for your scene assistant object. It will be passed all the 
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
  log("configScene constructor.");
  log("Got params: " + JSON.stringify(params));
  for(var field in params) {
    log("params[" + field + "] = " + JSON.stringify(params[field]));
  }
  this.params = params;
}

ConfigSyncMLAccountAssistant.prototype.setup = function () {
	/* this function is for setup tasks that have to happen when the scene is first created */
		
	/* use Mojo.View.render to render view templates and add them to the scene, if needed */
	
	log("CONFIG ASSISTANT!!!");
	
	if (currentAccount >= 0 && currentAccount < accounts.length) {
	  this.account = accounts[currentAccount];
	} else {
	  this.account = {};
	}
  if (!this.account.datastores) {
    this.account.datastores = { calendar: { enabled: false }, contacts: { enabled: false }};
  }
  if (!this.account.datastores.calendar) {
    this.account.datastores.calendar = { enabled: false };
  }
  if (!this.account.datastores.contacts) {
    this.account.datastores.contacts = { enabled: false };
  }
  if (!this.account.deviceName) {
    this.account.deviceName = Mojo.Environment.DeviceInfo.modelNameAscii;
  }
  
  this.controller.setupWidget(Mojo.Menu.appMenu, {}, AppAssistant.prototype.MenuModel);

	/* setup widgets here */
	this.controller.setupWidget("txtName", { modelProperty: "name", hintText: $L("Display Name"), textCase: Mojo.Widget.steModeLowerCase }, this.account);
	this.controller.setupWidget("txtURL", { modelProperty: "url", hintText: $L("URL"), textCase: Mojo.Widget.steModeLowerCase }, this.account);
	this.controller.setupWidget("txtUser", { modelProperty: "username", hintText: $L("Username"), textCase: Mojo.Widget.steModeLowerCase}, this.account);
	this.controller.setupWidget("txtPass", { modelProperty: "password", hintText: $L("Password"), textCase: Mojo.Widget.steModeLowerCase}, this.account);
	this.controller.setupWidget("ckCalendar", { modelProperty: "enabled" }, this.account.datastores.calendar);
	this.controller.setupWidget("lsCalendarMethod", {choices: [
		{ label: $L("Slow"),				value: "slow"},
		{ label: $L("Two-Way"),				value: "two-way" },
		{ label: $L("Refresh from Server"),	value: "refresh-from-server"},
		{ label: $L("Refresh from Client"),	value: "refresh-from-client"},
		{ label: $L("One Way from Server"), value: "one-way-from-server"},
		{ label: $L("One Way from Client"), value: "one-way-from-client"}
	], label: $L("Sync method"),
		modelProperty: "method"}, this.account.datastores.calendar);
	this.controller.setupWidget("txtCalendarPath", { modelProperty: "path", hintText: $L("Datastore Path"), textCase: Mojo.Widget.steModeLowerCase}, this.account.datastores.calendar);
	this.controller.setupWidget("ckContacts", { modelProperty: "enabled" }, this.account.datastores.contacts);
	this.controller.setupWidget("lsContactsMethod", {choices: [
		{ label: $L("Slow"),				value: "slow"},
		{ label: $L("Two-Way"),				value: "two-way" },
		{ label: $L("Refresh from Server"),	value: "refresh-from-server"},
		{ label: $L("Refresh from Client"),	value: "refresh-from-client"},
		{ label: $L("One Way from Server"), value: "one-way-from-server"},
		{ label: $L("One Way from Client"), value: "one-way-from-client"}
	], label: $L("Sync method"),
		modelProperty: "method"}, this.account.datastores.contacts);
  this.controller.setupWidget("txtContactsPath", { modelProperty: "path", hintText: $L("Datastore Path"), textCase: Mojo.Widget.steModeLowerCase}, this.account.datastores.contacts);
	
  this.controller.setupWidget("txtDeviceName", { modelProperty: "deviceName", hintText: $L("Name of this device on server"), textCase: Mojo.Widget.steModeLowerCase}, this.account);
	
	this.btnSaveModel = { buttonClass:'primary', label: $L("Check Credentials"), disabled: false};
	this.controller.setupWidget("btnSave", {type: Mojo.Widget.activityButton}, this.btnSaveModel);
	/* add event handlers to listen to events from widgets */
	Mojo.Event.listen(this.controller.get("btnSave"), Mojo.Event.tap, this.checkCredentials.bind(this));
	
	this.spinnerModel = { spinning: false };
	this.controller.setupWidget("saveSpinner", this.attributes = { spinnerSize: "large" }, this.spinnerModel);
	this.controller.get('Scrim').hide();
	
  this.btnDeleteModel = { label: $L("Delete this account"), disabled: false};
	if (!this.params) {
	  this.controller.setupWidget("btnDelete", {}, this.btnDeleteModel); 
	  Mojo.Event.listen(this.controller.get("btnDelete"), Mojo.Event.tap, this.deleteThisAccount.bind(this));
	}
};

ConfigSyncMLAccountAssistant.prototype.deleteThisAccount = function () {
  if (currentAccount >= 0 && currentAccount < accounts.length) {
    accounts[currentAccount].deleteThis = true;
    log("Saving changes to accounts.");
    this.controller.get('Scrim').show();
    this.controller.get('saveSpinner').mojo.start();
    PalmCall.call("palm://info.mobo.syncml.client.service", "storeAccounts", {accounts: accounts }).then(this, function (f) {
      log("Accounts stored, result: " + JSON.stringify(f.result));
      PalmCall.call("palm://info.mobo.syncml.client.service","getAccounts",{}).then(this, function(f2) {
        if (f2.result.returnValue === true) {
          accounts = f2.result.accounts;
          log("Got " + accounts.length + " accounts fresh from service");
        }
        this.popScene();
      });
    });
  } else {
    log("Account was not saved in db, nothing to do.");
    this.popScene();
  }
};

ConfigSyncMLAccountAssistant.prototype.enableControls = function () {
  //Disable spinning login button
  this.controller.get("btnSave").mojo.deactivate();
  this.controller.get('Scrim').hide();
  this.controller.get('saveSpinner').mojo.stop();


  //Enable other controls
  this.account.disabled = false;
  this.controller.modelChanged(this.account);
  this.account.datastores.contacts.disabled = false;
  this.controller.modelChanged(this.account.datastores.contacts);
  this.account.datastores.calendar.disabled = false;
  this.controller.modelChanged(this.account.datastores.calendar);
  this.btnSaveModel.disabled = false;
  this.controller.modelChanged(this.btnSaveModel);
};

ConfigSyncMLAccountAssistant.prototype.disableControls = function () {
  //Disable spinning login button
  this.controller.get("btnSave").mojo.activate();
  this.controller.get('Scrim').show();
  this.controller.get('saveSpinner').mojo.start();

  //disable other controls
  this.account.disabled = true;
  this.controller.modelChanged(this.account);
  this.account.datastores.contacts.disabled = true;
  this.controller.modelChanged(this.account.datastores.contacts);
  this.account.datastores.calendar.disabled = true;
  this.controller.modelChanged(this.account.datastores.calendar);
  this.btnSaveModel.disabled = true;
  this.controller.modelChanged(this.btnSaveModel);
};

ConfigSyncMLAccountAssistant.prototype.checkCredentials = function () {
  this.disableControls();
  
	if (!this.account.name) {
	  log ("Need account.name to add account");
	  this.showLoginError ("Account Name", "Please specify a valid account name.");
	  return;
	}
	
	if (!this.account.url) {
	  log ("Need account.url to add account");
	  this.showLoginError ("URL", "Please specify a valid account url.");
	  return;
	}
	
	if (!this.account.username) {
	  log ("Need account.username to add account");
	  this.showLoginError ("username", "Please specify a valid account username.");
	  return;
	}
	
	if (!this.account.password) {
	  log ("Need account.password to add account");
	  this.showLoginError ("Password", "Please specify a valid account password.");
	  return;
	}

	var credFuture = PalmCall.call("palm://info.mobo.syncml.client.service/", "checkCredentials", {
    username: this.account.username, 
    password: this.account.password,
    url: this.account.url
  });
	credFuture.then(this, function (f) {
	  if (f.result.returnValue) {
	    log("Check credentials came back successful");
	    log("Result: " + JSON.stringify(f.result));
	    
	    if (typeof this.params != "undefined") {
	      this.accountSettings = {};
	      var template = this.params.initialTemplate;
	      template.config = this.account;
	      delete template.username;
	      delete template.password;
	    
	      for (var i = 0; i < template.capabilityProviders.length; i += 1) {
	        if (template.capabilityProviders[i].capability === "CALENDAR") {
	          template.capabilityProviders[i].enabled = this.account.datastores.calendar.enabled;
	          template.capabilityProviders[i].loc_name = this.account.name + " Calendar";
	          break;
	        }
	      }
	      for (var i = 0; i < template.capabilityProviders.length; i += 1) {
	        if (template.capabilityProviders[i].capability === "CONTACTS") {
	          template.capabilityProviders[i].enabled = this.account.datastores.contacts.enabled;
	          template.capabilityProviders[i].loc_name = this.account.name + " Contacts";
	          break;
	        }
	      }

	      template.loc_name = this.account.name;
	      this.accountSettings = {
	          "template":this.params.initialTemplate,
	          "username":this.account.username,
	          "defaultResult":{
	            "result":{
	              returnValue:true,
	              "credentials": f.result.credentials,
	              "config": this.account
	            }
	          }
	      };
	    }
	    
	    //only pop if coming from account manager.
	    if (typeof this.params != "undefined") {
	      //Display Account Creation Dialog
	      this.popScene();    
	    } else {
	      this.showLoginError("Success", "Credentials seem to be correct, server login successful.");
	    }
	  } else {
	    log("CheckCredentials came back, but failed.");
	    this.showLoginError ("Credentials", "Credentials were wrong or could not be checked. Please check settings");
	  }
	});	
};

ConfigSyncMLAccountAssistant.prototype.showLoginError = function(ErrorTitle, ErrorText) {
  this.controller.showAlertDialog({
    title: $L(ErrorTitle),
    message: JSON.stringify(ErrorText),
    choices: [{label:$L("OK"), value:"OK"}]
  });

  //Enable all controls
  this.enableControls();
  return;
};

ConfigSyncMLAccountAssistant.prototype.popScene = function() {
  if (this.params) {
    if (this.params.aboutToActivateCallback !== undefined) {
      this.params.aboutToActivateCallback(true);
    }
    Mojo.Log.info("ConfigSyncMLAccountAssistant popping scene.");
    Mojo.Log.info("ConfigSyncMLAccountAssistant accountSettings=", JSON.stringify(this.accountSettings));
  }
  this.controller.stageController.popScene(this.accountSettings);
};

ConfigSyncMLAccountAssistant.prototype.activate = function (event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
};

ConfigSyncMLAccountAssistant.prototype.handleCommand = function (event) {
  if (event.type == "mojo-back") {
    log("Got back command");
    event.stopPropagation();
    event.stop();
    if (typeof this.params == "undefined") {
      if (this.account.username && this.account.password && this.account.url && this.account.name) {
        log("Saving changes to accounts.");
        if (currentAccount >= 0 && currentAccount < accounts.length) {
          accounts[currentAccount] = this.account; 
        } else {
          currentAccount = accounts.length;
          accounts.push(this.account);
        }
        this.controller.get('Scrim').show();
        this.controller.get('saveSpinner').mojo.start();
        PalmCall.call("palm://info.mobo.syncml.client.service", "storeAccounts", {accounts: accounts }).then(this, function (f) {
          log("Accounts stored, result: " + JSON.stringify(f.result));
          PalmCall.call("palm://info.mobo.syncml.client.service","getAccounts",{}).then(this, function(f2) {
            if (f2.result.returnValue === true) {
              accounts = f2.result.accounts;
              log("Got " + accounts.length + " accounts fresh from service");
            }
            this.popScene();
          });
        });
      } else {
        if (this.account.username || this.account.password || this.account.url || this.account.name) {
          log("Account only partly configured, ask.");
          this.controller.showAlertDialog({
            onChoose: function(value) { if (value === "yes") { this.popScene(); } }.bind(this),
            title: $L("Sure?"),
            message: $L("Need account name, url, username and password. If you go back now, you will lose all changes. Really go back?"),
            choices:[
              {label:$L('Yes'), value:"yes", type:'negative'},
              {label:$L("Cancel"), value:"cancel", type:'dismiss'}
                ]
            }
          ); 
        } else {
          log("Account not properly configured, won't save.");
          this.popScene();
        }
      }
    } else {
      this.controller.showAlertDialog({
        onChoose: function(value) { if (value === "yes") { this.popScene(); } else if (value === "check") { this.checkCredentials(); } }.bind(this),
        title: $L("Sure?"),
        message: $L("Really go back and lose all settings? Press \"Check Credentials\" to continue account creation."),
        choices:[
          {label:$L("Check Credentials"), value:"check", type:'affirmative'},
          {label:$L('Yes'), value:"yes", type:'negative'},
          {label:$L("Cancel"), value:"cancel", type:'dismiss'}
            ]
        }
      ); 
    }
  }
};

ConfigSyncMLAccountAssistant.prototype.aboutToDeactivate = function (event) {
  log("About to deactivate!");
};

ConfigSyncMLAccountAssistant.prototype.deactivate = function (event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
};

ConfigSyncMLAccountAssistant.prototype.cleanup = function (event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};

