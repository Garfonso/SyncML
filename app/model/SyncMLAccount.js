function SyncMLAccount(){
    this.username = undefined;
    this.password = undefined;
    this.url = undefined;
    this.name = undefined;
    
    this.syncContacts = false;
    this.syncContactsPath = undefined;
    this.syncContactsMethod = "slow";
    this.syncCalendar = false;
    this.syncCalendarPath = undefined;
    this.syncCalendarMethod = "slow";
    
    this.webOsAccountId = undefined;
    this.webOsCalendarId = undefined;
	this.webOsCalendarRev = 0;
    this.webOsContactsId = undefined;
	this.webOsContactsRev = 0;
	this.dbId = undefined;

    this.version = 1;
}

//TODO: rework them to store data in db8 files!
/*SyncMLAccount.prototype.saveConfig =  function(){
    log("=============SAVECONFIG CALLED");
//	if(this.deleted)
//	{
//		log("Account was deleted recently, won't save it again.");
//		return;
//	}
	
//	log("AccountID: " + this.webOsAccountId);
	//var cookie1 = new Mojo.Model.Cookie("defaultAccount");
    //cookie1.put(account);
//	if(this.webOsAccountId === undefined)
//	{
//		this.createAccount();
//	}
//	else{
//		this.modifyAccount();
//	}
}*/

SyncMLAccount.prototype.saveConfig = function(){
	try {
		log("SaveCofnig called!!! For webos id: " + this.webOsAccountId + " and db id " + this.dbId );
		//log("saving info.mobo.syncml.store.accounts -> value:" + acctId);
		var acctObj = [{
			"_kind": "info.mobo.syncml.store.accounts:1",
			"username": this.username,
			"password": this.password,
			"name": this.name,
			"webOsAccountId": this.webOsAccountId,
			"url": this.url,
			"syncContactsPath": this.syncContactsPath,
			"syncContactsMethod": this.syncContactsMethod,
			"syncCalendarPath": this.syncCalendarPath,
			"syncCalendarMethod": this.syncCalendarMethod,
			
			"syncCalendar": this.syncCalendar,
			"syncContacts": this.syncContacts,
			
			"webOsCalendarId": this.webOsCalendarId,
			"webOsContactsId": this.webOsContactsId,
			"webOsCalendarRev": this.webOsCalendarRev,
			"webOsContactsRev": this.webOsContactsRev
		}];
		var resultFunc = function(future){
			var result = future.result;
			if (result.returnValue === true) {
				log("Result: " + JSON.stringify(result));
				log("Successfully put obj into db.");
				if (this.dbId === undefined) {
					log("Read new db id: " + result.results[0].id + " was " + this.dbId);
					this.dbId = result.results[0].id;
				}
			}
			else {
				result = future.exception;
				log("put AcctId failure: Err code=" + result.errorCode + "Err message=" + result.message);
			}
		};
		
		if (this.dbId === undefined) {
			DB.put(acctObj).then(this, resultFunc);
		}
		else {
			acctObj[0]._id = this.dbId;
			DB.merge(acctObj).then(this, resultFunc);
		}
	}
	catch(e)
	{
		log("Error: " + e.message + " - " + e.stack);
		log("Error: " + JSON.stringify(e));
	}
};

SyncMLAccount.prototype.readFromConfig = function(){
	log("READFROMCONFIG==============");
   /* var future = this.findAccount();
	log("future: " + JSON.stringify(future));
	future.then(this,function(f){
		log("Future " + JSON.stringify(future));
		log("==========returned " + JSON.stringify(f));
		log("Result: " + JSON.stringify(f.result));
	});
	log("future: " + JSON.stringify(future));*/
	this.findAccount();
};

//get the accountId - if the returned JSON is blank then we know to create the account.
SyncMLAccount.prototype.findAccount = function() {
	var query = {"from": "info.mobo.syncml.store.accounts:1"};

	DB.find(query, false, false).then(this, function(future) {
	      log("DB find returned, result: " + JSON.stringify(future.result));
		  var result = future.result;
	      if (result.returnValue === true) {	
			if(future.result.results.length>0) {
		        log("Got accountId: " + JSON.stringify(future.result.results[0]));
				result = future.result.results[0];
				this.webOsAccountId = result.webOsAccountId;
				this.dbId = result._id;
					
				this.username = result.username;
				this.password = result.password;
				this.name = result.name;
				this.url = result.url;
				this.syncCalendar = result.syncCalendar;
				this.syncContacts = result.syncContacts;
				this.syncContactsPath = result.syncContactsPath; 
				this.syncContactsMethod = result.syncContactsMethod;
				this.syncCalendarPath = result.syncCalendarPath;
				this.syncCalendarMethod = result.syncCalendarMethod;
				
				this.webOsCalendarId = result.webOsCalendarId;
				this.webOsContactsId = result.webOsContactsId;
				this.webOsCalendarRev = result.webOsCalendarRev;
				this.webOsContactsRev = result.webOsContactsRev;
				
				if(this.webOsCalendarRev === undefined) 
				{
					this.webOsCalendarRev = 0;
				}
				if(this.webOsContactsRev === undefined)
				{
					this.webOsContactsRev = 0;
				}
			} else {
				this.webOsAccountId = undefined;
				future.result = "";
			}
			
			if(future.result.results.length > 1)
			{
				var i;
				for(i = 1; i < future.result.results.length; i++)
				{
					this.deleteAccountConfig(future.result.results[i]._id);
				}
			}
			
		  } else {  
	         result = future.exception;
	         log("Cound not find accountId: Err code = " + result.errorCode + "Err message=" + result.message); 
			 this.webOsAccountId = undefined;
      }
	});
};

SyncMLAccount.prototype.getCapabilities = function() {
	var caps = [];
	
	if(this.syncCalendar)
	{
		caps.push({ "id": "info.mobo.syncml.calendar", "capability": "CALENDAR" });
	}
	if(this.syncContacts)
	{
		caps.push({ "id": "info.mobo.syncml.contact", "capability": "CONTACTS" });	
	}
	
	log("Capabilitproviders: " + JSON.stringify(caps));
	return caps;
};

SyncMLAccount.prototype.parseCapabilities = function(caps) {
	var i;
	this.syncCalendar = false;
	this.syncContacts = false;
	for (i = 0; i < caps.length; i++) {
		if (caps[i].capability === "CALENDAR") {
			this.syncCalendar = true;
			log("Calendar cap set, will sync calendar");
		}
		else if (caps[i].capability === "CONTACTS") {
			this.syncContacts = true;
			log("Contact cap set, will sync contacts");
		}
	}
};

SyncMLAccount.prototype.createAccount = function(success,error){
	this.controller.serviceRequest("palm://com.palm.service.accounts/", {
		method: "createAccount",
		parameters: {"templateId"          : "info.mobo.syncml.account",
					 "capabilityProviders" : this.getCapabilities(),
					 "username"            : this.username,
					 "alias"			   : this.name,
					 "credentials"         : {"common":{ "password" : this.password }},
					 "config"              : {  "url": this.url, "syncContacts": this.syncContacts, "syncContactsPath": this.syncContactsPath, "syncContactsMethod": this.syncContactsMethod,
					                            "syncCalendar": this.syncCalendar, "syncCalendarPath": this.syncCalendarPath, "syncCalendarMethod": this.syncCalendarMethod }
		},
		onSuccess: function(e) { log("Account object = "+JSON.stringify(e)); this.webOsAccountId = e.result._id; this.saveConfig(); if(success !== undefined) { success.call(); } }.bind(this),
		onFailure: function(e) { log("createAccount failure: errorCode = " + e.errorCode + ", errorText = "+e.errorText); if(error !== undefined) { error.call();} }.bind(this)      
	});
};

SyncMLAccount.prototype.deleteAccountConfig = function(id)
{
	var deleteSelf = true;
	var toDelId = this.dbId;
	if(id !== undefined)
	{
		deleteSelf = false;
		toDelId = id;
	}
	
	if (toDelId !== undefined) {
		var ids = [toDelId];
		this.controller.serviceRequest("palm://com.palm.db/", {
			method: "del",
			parameters: {
				"ids": ids
			},
			onSuccess: function(e){
				log("del success!" + JSON.stringify(e));
				log("del #1, id=" + e.results[0].id + ", rev=" + e.results[0].rev);
				if (deleteSelf) {
					this.dbId = undefined;
				}
			}.bind(this),
			onFailure: function(e){
				log("del failure! Err = " + JSON.stringify(e));
			}
		});
	}
};

SyncMLAccount.prototype.deleteAccount = function(){
	if (this.webOsAccountId !== undefined) {
		this.controller.serviceRequest("palm://com.palm.service.accounts/", {
			method: "deleteAccount",
			parameters: {
				"accountId": this.webOsAccountId
			},
			onSuccess: function(e){
				log("delte account success" + JSON.stringify(e) + "\n");
				this.webOsAccountId = undefined;
				this.deleteAccountConfig();
				}.bind(this),
			onFailure: function(e){
				log("deleteAccount failure" + JSON.stringify(e));
			}.bind(this)
		});
	}
	else
	{
		this.deleteAccountConfig();
	}
};

SyncMLAccount.prototype.getAccountInfo = function(success,error){
	this.controller.serviceRequest("palm://com.palm.service.accounts/", {
		method: "getAccountInfo",
		parameters: {
					 "accountId": this.webOsAccountId
					 },
					 onSuccess: function(e) { 
						log("getAccountInfo success" + JSON.stringify(e) + "\n");
						this.name = e.result.alias;
						this.parseCapabilities(e.result.capabilityProviders);
						this.username = e.result.username;
						
						/*
						this.syncContactsPath = e.result.config.syncContactsPath;
						this.syncContactsMethod = e.result.config.syncContactsMethod;
						this.syncCalendarPath = e.result.config.syncCalendarPath;
						this.syncCalendarMethod = e.result.config.syncCalendarMethod;*/
						if(success !== undefined)
						{
							success.call();
						}
					}.bind(this),
					onFailure: function(e) { 
						log("getAccountInfo failure: errorCode = " + e.errorCode + ", errorText = "+e.errorText);
						if(error !== undefined)
						{
							error.call();
						}
					}.bind(this)
	});
};

//can be used to change capabilities, too:
SyncMLAccount.prototype.modifyAccount = function(){
	this.controller.serviceRequest("palm://com.palm.service.accounts/", {
		method: "modifyAccount",
		parameters: {"accountId": this.webOsAccountId,
			         object: {
						"username": this.username,
						"capabilityProviders": this.getCapabilities(),
						"alias": this.name,
						"credentials": {
							"common": {
								"password": this.password
							}
						},
						"config": {
							"url": this.url,
							"syncContactsPath": this.syncContactsPath,
							"syncContactsMethod": this.syncContactsMethod,
							"syncCalendarPath": this.syncCalendarPath,
							"syncCalendarMethod": this.syncCalendarMethod
							} //this will go to transport service...??? Why don't I get that with getAccountInfo? :(
						}
		},
		onSuccess: function(e) { log("Account modified = "+JSON.stringify(e)); this.saveConfig(); },
		onFailure: function(e) { log("modifiyAccount failure: errorCode = " + e.errorCode + ", errorText = "+e.errorText); }      
	});
};

var account = new SyncMLAccount();
