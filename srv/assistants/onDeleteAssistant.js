var onDeleteAssistant = function (future) {};

onDeleteAssistant.prototype.run = function (outerFuture) {
  log("============== onDeleteAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(outerFuture.result));
  
  if (locked === true) {
    log("Locked... already running?");
    previousOperationFuture.then(this, function (f) {
      log("PreviousOperation finished " + JSON.stringify(f.result) + " , starting onDeleteAssistant");
      this.run(outerFuture);
    });
    return;
  }
  
  locked = true;
  //first initialize keymanager and accounts:
  var f = initialize({keymanager: true, accounts: true});
  f.then(this, function (future) {
    if (future.result.returnValue === true) {
      log("Init complete");
                      
      var account = SyncMLAccount.getAccountById(this.controller.args.accountId);
      if (!account) {
        log("Account not found, already deleted?");
        finishAssistant(outerFuture, { returnValue: false });
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
          finishAssistant(outerFuture, { returnValue: true });
        });
      });
    } else {
      log("Init failed" + JSON.stringify(f.result));
      finishAssistant(outerFuture, { returnValue: false });
    }
  });
};
