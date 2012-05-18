var onCreateAssistant = function (future) {};

onCreateAssistant.prototype.run = function (outerFuture) {
  var account;
  log("============== OnCreateAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(outerFuture.result));
  
  if (locked === true) {
    log("Locked... already running?");
    outerFuture.result = { returnValue: false, notStarted: true };
    return;
  }
  
  //first initialize keymanager and old accounts:
  locked = true;
  var f = initialize({keymanager: true, accounts: true});
  f.then(this, function (future) {
    if (future.result.returnValue === true) {
      log("Init complete");
      
      //build account object:
      account = this.controller.args.config;
      account.accountId = this.controller.args.accountId;
      
      //then add account using my account management stuff.
      SyncMLAccount.addNewAccount(account, true).then(this, function (f2) {
        if (f2.result.returnValue) {
          //now account is saved in db and all is good. :)
          log("Account saved successfully.");
        } else {
          log("Account save failed. :(");
        }
        locked = false;
        outerFuture.result = {returnValue: f2.result.returnValue};
        //start a background sync:
        PalmCall.call("palm://info.mobo.syncml.client.service", "sync", account);
      });
    } else {
      log("Init failed" + JSON.stringify(f.result));
      outerFuture.result = {returnValue: false};
      locked = false;
    }
  });
};
