var onEnabledAssistant = function (future) {};

onEnabledAssistant.prototype.run = function (outerFuture) {
  log("============== onEnabledAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(outerFuture.result));
  
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
      if (this.controller.args.capabilityProviderId === "info.mobo.syncml.calendar") {
        if (account.datastores.calendar.enabled != this.controller.args.enabled) {
          account.datastores.calendar.enabled = this.controller.args.enabled;

          //save the changed setting in the db:
          SyncMLAccount.setAccount(account);
          SyncMLAccount.saveConfig().then(this, function (f2) {
            //save changes came back, now react to the change.
            if (account.datastores.calendar.enabled) {
              //if newly enabled, start a sync:
              log("Calendar got enabled, initiating sync.");
              PalmCall.call("palm://info.mobo.syncml.client.service", "sync", account).then(this, function (f3) {
                log("Sync finished: " + JSON.stringify(f3.result));
                outerFuture.result = {returnValue: f3.result.returnValue};
                locked = false;
              });
            } else {
              //if disabled, delete all events:
              log("Calendar got disabled, deleting calendar entries.");
              eventCallbacks.setAccountAndDatastoreIds({accountId: account.accountId, calendarId: account.datastores.calendar.dbId});
              eventCallbacks.deleteAllEvents({callback: function (result) {
                log("DeleteAllEvents came back: " + JSON.stringify(result));
                outerFuture.result = {returnValue: result.success};
                locked = false;
              }.bind(this)});
            }
          });
        } else {
          log("Should change calendar, but was already the same: " + account.datastores.calendar.enabled + " == " + this.controller.args.enabled);
          outerFuture.result = {returnValue: true};
          locked = false;
        }
      }
    } else {
      log("Init failed" + JSON.stringify(f.result));
      outerFuture.result = {returnValue: false};
      locked = false;
    }
  });
};