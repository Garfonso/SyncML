function ConfigSyncMLAccountAssistant() {
	/* this is the creator function for your scene assistant object. It will be passed all the 
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
}

ConfigSyncMLAccountAssistant.prototype.setup = function() {
	/* this function is for setup tasks that have to happen when the scene is first created */
		
	/* use Mojo.View.render to render view templates and add them to the scene, if needed */
	
	log("CONFIG ASSISTANT!!!");
	
	/* setup widgets here */
	this.controller.setupWidget("txtName", { modelProperty: "name", hintText: $L("Display Name"), textCase: Mojo.Widget.steModeLowerCase },account);
	this.controller.setupWidget("txtURL", { modelProperty: "url", hintText: $L("URL"), textCase: Mojo.Widget.steModeLowerCase }, account);
	this.controller.setupWidget("txtUser", { modelProperty: "username", hintText: $L("Username"), textCase: Mojo.Widget.steModeLowerCase},account);
	this.controller.setupWidget("txtPass", { modelProperty: "password", hintText: $L("Password"), textCase: Mojo.Widget.steModeLowerCase},account);
	this.controller.setupWidget("ckCalendar",{ modelProperty: "syncCalendar" },account);
	this.controller.setupWidget("lsCalendarMethod", {choices: [
		{ label: $L("Slow"),				value: "slow"},
		{ label: $L("Two-Way"),				value: "two-way" },
		{ label: $L("Refresh from Server"),	value: "refresh-from-server"},
		{ label: $L("Refresh from Client"),	value: "refresh-from-client"},
		{ label: $L("One Way from Server"), value: "one-way-from-server"},
		{ label: $L("One Way from Client"), value: "one-way-from-client"}
		], label: $L("Sync method"),
		modelProperty: "syncCalendarMethod"}, account);
	this.controller.setupWidget("txtCalendarPath", { modelProperty: "syncCalendarPath", hintText: $L("Datastore Path"), textCase: Mojo.Widget.steModeLowerCase},account);
	this.controller.setupWidget("ckContacts",{ modelProperty: "syncContacts" },account);
	this.controller.setupWidget("lsContactsMethod", {choices: [
		{ label: $L("Slow"),				value: "slow"},
		{ label: $L("Two-Way"),				value: "two-way" },
		{ label: $L("Refresh from Server"),	value: "refresh-from-server"},
		{ label: $L("Refresh from Client"),	value: "refresh-from-client"},
		{ label: $L("One Way from Server"), value: "one-way-from-server"},
		{ label: $L("One Way from Client"), value: "one-way-from-client"}
		], label: $L("Sync method"),
		modelProperty: "syncContactsMethod"}, account);
	this.controller.setupWidget("txtContactsPath", { modelProperty: "syncContactsPath", hintText: $L("Datastore Path"), textCase: Mojo.Widget.steModeLowerCase},account);
	this.controller.setupWidget("btnSave", {}, { label: $L("Save Config")});
	this.controller.setupWidget("btnDelete", {}, { label: $L("Delete Accounts")});
	/* add event handlers to listen to events from widgets */
	Mojo.Event.listen(this.controller.get("btnSave"),Mojo.Event.tap,this.trySaveConfig.bind(this));
	Mojo.Event.listen(this.controller.get("btnDelete"),Mojo.Event.tap,this.deleteAccount.bind(this));
};

ConfigSyncMLAccountAssistant.prototype.deleteAccount = function(event)
{
	log("DELETE ACCOUNT");
	//if(account.webOsAccountId !== undefined)
	//{
		log("ACCOUNT ID SPECIFIED: " + account.webOsAccountId);
		/*var myDataTypes = [];
		if(account.syncCalendar)
		{
			myDataTypes.push("CALENDAR");
		}
		if(account.syncContacts)
		{
			myDataTypes.push("CONTACTS")
		}*/
		
		/*this.controller.serviceRequest('palm://com.palm.accounts/crud', {
			method:   'deleteAccount',
			parameters: {
				accountId: account.webOsAccountId,
				dataTypes: ["CONTACTS", "CALENDAR"]
			},
			onSuccess: function(dataTypesDeleted, returnValue){ 
				Mojo.Log.info("Deleted %j, retval %j",dataTypesDeleted,returnValue);
				account.webOsAccountId = undefined;
				account.webOsCalendarId = undefined;
				saveConfig(); 
			},
			onFailure: function(error){ Mojo.Controller.errorDialog("Could not delete account. - " + Object.toJSON(error) + " - " + account.webOsAccountId);}
		});*/
		account.deleteAccount();
		//this.controller.stageController.popScene();
	//}
	//else{
	//	log("NO ACCOUNT ID, CAN'T DELETE");
	//}
};

ConfigSyncMLAccountAssistant.prototype.trySaveConfig = function(){
	var ask = false;
	var change = [];
	var print = "";
	account.deleted = false;
	if (account.syncCalendarMethod === "refresh-from-server") {
		ask = true;
		change.push("syncCalendarMethod");
		print = $L("events on device");
	}
	else 
		if (account.syncCalendarMethod === "refresh-from-client") {
			ask = true;
			change.push("syncCalendarMethod");
			print = $L("events on server");
		}
	
	if (account.syncContactsMethod === "refresh-from-server") {
		ask = true;
		change.push("syncContactsMethod");
		if (print !== "") {
			print += " " + $L("and") + " ";
		}
		print += $L("contacts on device");
	}
	else 
		if (account.syncContactsMethod === "refresh-from-client") {
			ask = true;
			change.push("syncContactsMethod");
			if (print !== "") {
				print += " " + $L("and") + " ";
			}
			print += $L("contacts on server");
		}
	
	if (ask) {
		this.controller.showAlertDialog({
			onChoose: function(value){
				if (value === false) {
					var i;
					for (i = 0; i < change.length; i++) {
						account[change[i]] = "two-way";
					}
					this.controller.get("lsContactsMethod").mojo.modelChanged();
				}
				
				log("USER MADE HIS DECISION. WILL NOW SAVE DATA: ")
				account.saveConfig();
			},
			title: $L("ATTENTION"),
			message: $L("You will lose all " + print + " are you really sure you want to do that?"),
			choices: [{
				label: $L('Sure'),
				value: true,
				type: 'affirmative'
			}, {
				label: $L("No"),
				value: false,
				type: 'negative'
			}]
		});
	}
	else {
		log("Don't need to ask user, will now save data: ");
		account.saveConfig();
	}
};

ConfigSyncMLAccountAssistant.prototype.activate = function(event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
};

ConfigSyncMLAccountAssistant.prototype.deactivate = function(event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
	  this.trySaveConfig();
};

ConfigSyncMLAccountAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};
