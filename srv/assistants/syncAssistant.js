var syncAssistant = function (future) {};

syncAssistant.prototype.finished = function (account) {
  var outerFuture = new Future(), saveAccounts, checkRevsResult = undefined, calendar, contacts, innerFuture = new Future(), res;
  
  saveAccounts = function () { 
    SyncMLAccount.setAccount(account);
    log("Saving config to store new revs.");
    SyncMLAccount.saveConfig(true).then(function (f) {
      log("StoreAccounts returned: " + JSON.stringify(f.result));
      outerFuture.result = { returnValue: f.result.returnValue };
    });
  };
  
  checkRevsResult = function (f) {
    if (f.result.calendar && f.result.contacts) {
      saveAccounts();
    } else {
      log("Cleanup not finished, yet: " + JSON.stringify(f.result));
      f.then(checkRevsResult);
    }
  };
  
  if (account.datastores.calendar && account.datastores.calendar.enabled) {
    calendar = account.datastores.calendar;
    if (calendar.ok === true) {
      log("Calendar sync worked.");
      //keep changes for next two-way.
      eventCallbacks.finishSync(account, innerFuture);
      if (calendar.method === "slow" || calendar.method.indexOf("refresh") !== -1) {
        calendar.method = "two-way";
      }
    } else {
      res = innerFuture.result;
      if (!res) {
        res = {};
      }
      res.calendar = true;
      innerFuture.result = res;
      log("Calendar sync had errors.");
    }
  } else {
    res = innerFuture.result;
    if (!res) {
      res = {};
    }
    res.calendar = true;
    innerFuture.result = res;    
  }
  if (account.datastores.contacts && account.datastores.contacts.enabled) {
    contacts = account.datastores.contacts;
    if (contacts.ok) {
      log("Contacts sync worked.");
      //TODO: something like in eventCallbacks needed here, too!
      if (contacts.method === "slow" || contacts.method.indexOf("refresh") !== -1) {
        contacts.method = "two-way";
      }
    } else {
      log("Contacts sync had errors.");
      res = innerFuture.result;
      if (!res) {
        res = {};
      }
      res.contacts = true;
      innerFuture.result = res;
    }
  } else {
    res = innerFuture.result;
    if (!res) {
      res = {};
    }
    res.contacts = true;
    innerFuture.result = res;
  }

  innerFuture.then(this, checkRevsResult);
  return outerFuture;
};

syncAssistant.prototype.run = function (outerFuture, subscription) {
  log("============== syncAssistant");
  var finishAssistant, logError, initializeCallback, syncCallback, finishCallback, checkAccountCallback, 
      f, args = this.controller.args, account = args;
  try {
    outerFutures.push(outerFuture);
    finishAssistant = function (result) {
      finishAssistant_global({name: "syncAssistant", outerFuture: outerFuture, result: result, accountId: args ? args.accountId : "noId"});
      logSubscription = undefined; //delete subscription.
    };
    logError = function(e) {
      logError_global(e, "syncAssistant");
      finishAssistant({finalResult: true, returnVaule: false, success: false});
    };
    //log("Params: " + JSON.stringify(this.controller.args));
    log("Future: " + JSON.stringify(outerFuture.result));
        
    if (!startAssistant({name: "syncAssistant", outerFuture: outerFuture, accountId: args ? args.accountId : "noId"})){
      logSubscription = subscription; //TODO: try if that does something useful... don't think so right now. :(
      return;
    }
    
    if (!args.accountId && !args.index >= 0 && !args.name) {
      log("Need accountId or account.index or account.name to sync!");
      finishAssistant({ finalResult: true, success: false, reason: "Parameters not sufficient. " + JSON.stringify(args) });
      return;
    }

    
    finishCallback = function (f) {
      if (f.result.returnValue === true) {
        //config will be passed to onCreate.
        log("Success, returning to client");
        finishAssistant({ finalResult: true, success: true, reason: "All went well, updates", account: account});
      } else {
        log("Failure, returning to client");
        finishAssistant({ finalResult: true, success: false, reason: "Failure in cleanup, expect trouble with next sync."});
      }
    };

    syncCallback = function (result) { 
      try {
        log("Sync came back.");
        //log("result: " + JSON.stringify(result));
        //log(JSON.stringify(result));
        if (result.success === true) {
          this.finished(account).then(this, finishCallback);
        } else {
          finishAssistant({ finalResult: true, success: false, reason: "Internal sync error." });
        }
      } catch (e) {
        logError(e);
      }
    };

    checkAccountCallback = function (f3) {
      try {
        if (f3.result.returnValue === true) {
          log("Finishing initialization of SyncML framework.");
          SyncML.initialize(account);
          delete account.datastores.contacts; //be sure to not sync contacts, yet.
          eventCallbacks.setAccountAndDatastoreIds({accountId: account.accountId, calendarId: account.datastores.calendar.dbId});
          eventCallbacks.setRevisions({calendar: account.datastores.calendar.lastRev || 0});
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
          log("SyncML initialized.");
          logToApp("SyncML completely initialized, starting sync process.");
          SyncML.sendSyncInitializationMsg(syncCallback.bind(this));
        } else {
          log("check and creation of accounts and calendar did not work.");
          finishAssistant({ finalResult: true, success: false, reason: "Could not create/check account/calendar." });
        }
      } catch (e) {
        logError(e);
      }
    };

    initializeCallback = function (f2) {
      if (f2.result.returnValue === true) {
        log("initialize.result: " + JSON.stringify(f2.result));
        
        log("Starting sync");
        if (account.accountId) {
          account = SyncMLAccount.getAccountById(args.accountId);
        } else if (account.index >= 0) {
          account = SyncMLAccount.getAccount(args.index);
        } else if (account.name) {
          account = SyncMLAccount.getAccountByName(args.name);
        }
        
        if(!account.username || !account.password || !account.url) {
          log("Account seems to be not fully configured. Can't sync.");
          log("Account: " + JSON.stringify(account));
          finishAssistant({ finalResult: true, success: false, reason: "Account not fully configured: " + JSON.stringify(account) });
          return;
        }

        this.checkAccount(account).then(this, checkAccountCallback);
      } else {
        log("Initialization failed... :(");
        finishAssistant({ finalResult: true, success: false, reason: "Initialization failed." });
      }
      //return future;
    };
    
    logSubscription = subscription;
    try {
      f = initialize({devID: true, keymanager: true, accounts: true, accountsInfo: true, iCal: true});
      f.then(this, initializeCallback);
    } catch (e) { 
      logError(e);
    }
  } catch (e) {
    logError(e);
  }
};

syncAssistant.prototype.checkAccount = function (account) {
  var future = new Future();
  log("Check account");
  if (account.accountId !== undefined) {
    log("Have account Id: " + account.accountId);
    SyncMLAccount.getAccountInfo(account).then(this, function (f) {
      var result = f.result;
      if (result.account && result.account.accountId) {
        eventCallbacks.checkCalendar(result.account).then(function (f) {
          future.result = f.result;
        });
      } else {
        this.checkAccount(account).then(function (f2) {
          future.result = f2.result;
        }); //try to create account.
      }
    });
  } else {
    log("Need to create account.");
    SyncMLAccount.createAccount(account).then(this, function(future) {
      if (future.result.returnValue) {
        log("Account created.");
        eventCallbacks.checkCalendar(acc).then(function (f) {
          future.result = f.result;
        });
      } else {
        log("Could not create account.");
        throw {name: "AccountError", message: "Could not create account."};
      }
    });
  }
  return future;
};
