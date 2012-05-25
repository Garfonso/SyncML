var onEnabledAssistant = function (future) {};

onEnabledAssistant.prototype.run = function (outerFuture) {
  log("============== onEnabledAssistant");
  var saveCallback, deleteCallback, finishAssistant, logError, initializeCallback, f;
  try {
    outerFutures.push(outerFuture);
    finishAssistant = function (result) {
      finishAssistant_global({name: "onEnabledAssistant", outerFuture: outerFuture, result: result});
    };
    logError = function(e) {
      logError_global(e, "onEnabledAssistant");
      finishAssistant({returnVaule: false, success: false});
    };
    log("Params: " + JSON.stringify(this.controller.args));
    log("Future: " + JSON.stringify(outerFuture.result));
    
    if (!startAssistant({name: "onEnabledAssistant" , "outerFuture": outerFuture})) {
      return;
    }
    
    //called after deleting all data from database.
    deleteCallback = function (result) {
      log("DeleteAllEvents came back: " + JSON.stringify(result));
      finishAssistant({ returnValue: false, success: result.success});
    };
    
    //called after saving the change.
    saveCallback = function (f2) {
      try {
        //save changes came back, now react to the change.
        if (account.datastores.calendar.enabled) {
          //if newly enabled, start a sync:
          log("Calendar got enabled, initiating sync.");
          finishAssistant({ returnValue: f3.result.returnValue, success: f3.result.returnValue}); //first give back lock, then trigger sync.
          PalmCall.call("palm://info.mobo.syncml.client.service", "sync", account).then(this, function (f3) {
            log("Sync finished: " + JSON.stringify(f3.result));
          });
          //log("Please sync manually...");
        } else {
          //if disabled, delete all events:
          log("Calendar got disabled, deleting calendar entries.");
          eventCallbacks.setAccountAndDatastoreIds({accountId: account.accountId, calendarId: account.datastores.calendar.dbId});
          eventCallbacks.deleteAllEvents({ callback: deleteCallback.bind(this) });
        }
      } catch(e) {
        logError(e);
      }
    };
    
    //init callback, most work is done here.
    initializeCallback = function (future) {
      try {
        if (future.result.returnValue === true) {
          log("Init complete");
          
          var account = SyncMLAccount.getAccountById(this.controller.args.accountId);
          if(!account) {
            log("Could not find account! Won't do anything.");
            finishAssistant({ returnValue: false, success: false });
            return;
          }
          if (this.controller.args.capabilityProviderId === "info.mobo.syncml.calendar") {
            if (account.datastores.calendar.enabled != this.controller.args.enabled || this.controller.args.enabled === true) {
              account.datastores.calendar.enabled = this.controller.args.enabled;
              log("Changed account " + account.name);
              
              //save the changed setting in the db:
              SyncMLAccount.setAccount(account);
              SyncMLAccount.saveConfig().then(this, saveCallback);
            } else {
              log("Should disable calendar, but was already disabled: " + account.datastores.calendar.enabled + " == " + this.controller.args.enabled);
              finishAssistant({ returnValue: true, success: true });
            }
          } else {
            log("Only calendar supported right now.");
          }
        } else {
          log("Init failed" + JSON.stringify(future.result));
          finishAssistant({ returnValue: false, success: false });
        }
      } catch (e) {
        logError(e);
      }
    };
    
    //first initialize keymanager and accounts:
    f = initialize({keymanager: true, accounts: true});
    f.then(this, initializeCallback);
  } catch (e) {
    logError(e);
  }
};