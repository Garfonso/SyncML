var onEnabledAssistant = function (future) {};

onEnabledAssistant.prototype.run = function (outerFuture) {
  log("============== onEnabledAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(outerFuture.result));
  
  if (locked === true) {
    log("Locked... already running?");
    previousOperationFuture.then(this, function (f) {
      log("PreviousOperation finished " + JSON.stringify(f.result) + " , starting onEnabledAssistant");
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
      if(!account) {
        log("Could not find account! Won't do anything.");
        finishAssistant(outerFuture, { returnValue: false, success: false });
        return;
      }
      if (this.controller.args.capabilityProviderId === "info.mobo.syncml.calendar") {
        if (account.datastores.calendar.enabled != this.controller.args.enabled) {
          account.datastores.calendar.enabled = this.controller.args.enabled;
          log("Changed account " + account.name);

          //save the changed setting in the db:
          SyncMLAccount.setAccount(account);
          SyncMLAccount.saveConfig().then(this, function (f2) {
            //save changes came back, now react to the change.
            if (account.datastores.calendar.enabled) {
              //if newly enabled, start a sync:
              log("Calendar got enabled, initiating sync.");
              finishAssistant(outerFuture, { returnValue: false, success: f3.result.returnValue}); //first give back lock, then trigger sync.
              PalmCall.call("palm://info.mobo.syncml.client.service", "sync", account).then(this, function (f3) {
                log("Sync finished: " + JSON.stringify(f3.result));
              });
            } else {
              //if disabled, delete all events:
              log("Calendar got disabled, deleting calendar entries.");
              eventCallbacks.setAccountAndDatastoreIds({accountId: account.accountId, calendarId: account.datastores.calendar.dbId});
              eventCallbacks.deleteAllEvents({callback: function (result) {
                log("DeleteAllEvents came back: " + JSON.stringify(result));
                finishAssistant(outerFuture, { returnValue: false, success: result.success});
              }.bind(this)});
            }
          });
        } else {
          log("Should change calendar, but was already the same: " + account.datastores.calendar.enabled + " == " + this.controller.args.enabled);
          finishAssistant(outerFuture, { returnValue: false, success: true });
        }
      } else {
        log("Only calendar supported right now.");
      }
    } else {
      log("Init failed" + JSON.stringify(f.result));
      finishAssistant(outerFuture, { returnValue: false, success: false });
    }
  });
};