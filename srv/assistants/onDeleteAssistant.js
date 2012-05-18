var onDeleteAssistant = function (future) {};

onDeleteAssistant.prototype.run = function (outerFuture) {
  log("============== onDeleteAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(future.outerFuture));
  
  if (locked === true) {
    log("Locked... already running?");
    outerFuture.result = { returnValue: false, notStarted: true };
    return;
  }
  
  locked = true;
  //first initialize keymanager and accounts:
  var f = initialize({keymanager: true, accounts: true});
  f.then(this, function (future) {
    if (future.result.returnValue === true) {
      log("Init complete");
                      
      var account = SyncMLAccount.getAccountById(this.controller.args.accountId);
      if (account.datastores.calendar.enabled) {
        log("Calendar was enabled, deleting calendar entries.");
        eventCallbacks.setAccountAndDatastoreIds({accountId: account.accountId, calendarId: account.datastores.calendar.dbId});
        eventCallbacks.deleteAllEvents({callback: function (result) {
          log("DeleteAllEvents came back: " + JSON.stringify(result));
        }.bind(this)});
      }

      deleteAccountFromDB(account);
      outerFuture.result = {returnValue: true};
      locked = false;
    } else {
      log("Init failed" + JSON.stringify(f.result));
      outerFuture.result = {returnValue: false};
      locked = false;
    }
  });
};
