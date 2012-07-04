var onEnabledAssistant = function (future) {};

onEnabledAssistant.prototype.run = function (outerFuture) {
  log("============== onEnabledAssistant");
  var saveCallback, deleteCallback, finishAssistant, logError, initializeCallback, f, account = undefined;
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
    var args = this.controller.args;
    
    if (!startAssistant({name: "onEnabledAssistant" , "outerFuture": outerFuture, run: this.run.bind(this) })) {
      return;
    }
    
    var ds = "calendar";
    if (args.capabilityProviderId === "info.mobo.syncml.calendar") {
      ds = "calendar";
    } else if (args.capabilityProviderId === "info.mobo.syncml.contact") {
      ds = "contacts";
    } else {
      finishAssistant({ returnValue: false, success: false });
      log("Unsupported capabilityProviderId: " + args.capabilityProviderId);
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
        if (account.datastores[ds].enabled) {
          //if newly enabled, start a sync:
          log(ds + " got enabled, initiating sync.");
          finishAssistant({ returnValue: f2.result.returnValue, success: f2.result.returnValue}); //first give back lock, then trigger sync.
          if (!syncingAccountIds.noId && !syncingAccountIds[account.accountId]) {
            log("Initiating sync...");
            PalmCall.call("palm://info.mobo.syncml.client.service", "sync", account).then(this, function (f3) {
              log("Sync finished.");
            });
          } else {
            log("Sync seems already in progress.");
          }
          //log("Please sync manually...");
        } else {
          //if disabled, delete all events:
          log(ds + " got disabled, deleting calendar entries.");
          if (ds === "calendar") {
            eventCallbacks.setAccountAndDatastoreIds({accountId: account.accountId, calendarId: account.datastores.calendar.dbId});
            eventCallbacks.deleteAllEvents({ callback: deleteCallback.bind(this) });
          } else {
            log("!!!!!!!!!!!!!!!!!!!!!! - ISSUE: Don't have delete all for contacts yet!!!");
            finishAssistant({ returnValue: false, success: false});
          }
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
          
          log("Args: " + JSON.stringify(args));
          account = SyncMLAccount.getAccountById(args.accountId);
          if(!account) {
            log("Could not find account! Won't do anything.");
            finishAssistant({ returnValue: false, success: false });
            return;
          }
          
          if (account.datastores[ds].enabled != args.enabled || args.enabled === true) {
            account.datastores[ds].enabled = args.enabled;
            log("Changed account " + account.name);

            //save the changed setting in the db:
            SyncMLAccount.setAccount(account);
            SyncMLAccount.saveConfig().then(this, saveCallback);
          } else {
            log("Should disable " + ds + ", but was already disabled: " + account.datastores[ds].enabled + " == " + args.enabled);
            finishAssistant({ returnValue: true, success: true });
          }
		  
          log("Checking acitivies");
          checkActivities(account);
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