var onDeleteAssistant = function (future) {};

onDeleteAssistant.prototype.run = function (outerFuture) {
  log("============== onDeleteAssistant");
  var finishAssistant, logError, initializeCallback, f;
  try {
    outerFutures.push(outerFuture);
    finishAssistant = function (result) {
      finishAssistant_global({name: "onDeleteAssistant", outerFuture: outerFuture, result: result});
    };
    logError = function(e) {
      logError_global(e, "onDeleteAssistant");
      finishAssistant({returnVaule: false, success: false});
    };
    log("Params: " + JSON.stringify(this.controller.args));
    log("Future: " + JSON.stringify(outerFuture.result));
    
    if (!startAssistant({name: "onDeleteAssistant", outerFuture: outerFuture, run: this.run.bind(this) })){
      return;
    }
    
    initializeCallback = function (future) {
      try {
        if (future.result.returnValue === true) {
          log("Init complete");
          
          var account = SyncMLAccount.getAccountById(this.controller.args.accountId);
          if (!account) {
            log("Account not found, already deleted?");
            finishAssistant({ returnValue: false, success: false });
            return;
          }
          if (account.datastores.calendar.enabled) {
            log("Calendar was enabled, deleting calendar entries.");
            eventCallbacks.setAccountAndDatastoreIds({accountId: account.accountId, calendarId: account.datastores.calendar.dbId});
            eventCallbacks.deleteAllEvents({callback: function (result) {
              log("DeleteAllEvents came back: " + JSON.stringify(result));
            }.bind(this)});
          }
          
          SyncMLAccount.deleteAccountFromDB(account).then(function (f) {
            log("Account deleted from db: " + JSON.stringify(f.result));
            SyncMLAccount.removeAccount(account);
            SyncMLAccount.saveConfig().then(function (f2) {
              log("Save accounts came back: " + JSON.stringify(f2.result));
              finishAssistant({ returnValue: true, success: true });
            });
          });
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
