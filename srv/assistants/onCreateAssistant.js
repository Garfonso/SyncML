var onCreateAssistant = function (future) {};

onCreateAssistant.prototype.run = function (outerFuture) {
  log("============== OnCreateAssistant");
  var account, finishAssistant, logError, initializeCallback, f;
  try {
    outerFutures.push(outerFuture);
    finishAssistant = function (result) {
      finishAssistant_global({name: "onCreateAssistant", outerFuture: outerFuture, result: result});
    };
    logError = function(e) {
      logError_global(e, "onCreateAssistant");
      finishAssistant({returnVaule: false, success: false});
    };
    log("Params: " + JSON.stringify(this.controller.args));
    log("Future: " + JSON.stringify(outerFuture.result));
    
    if (!startAssistant({name: "onCreateAssistant", outerFuture: outerFuture, run: this.run.bind(this) })){
      return;
    }
    
    //initialize callback, main work is done here.
    initializeCallback = function (future) {
      var acc2;
      try {
        if (future.result.returnValue === true) {
          log("Init complete");
          
          //build account object:
          account = this.controller.args.config;
          account.accountId = this.controller.args.accountId;
          acc2 = SyncMLAccount.getAccountById(account.accountId); 
          if (!acc2) {
            acc2 = SyncMLAccount.getAccountByName(account.name);
          }
          if (acc2) {
            log("Account with id " + account.accountId + " already present. Won't create!");
            finishAssistant({ returnValue: false, success: false });
            return;
          }
          
          //then add account using my account management stuff.
          SyncMLAccount.addNewAccount(account, true).then(this, function (f2) {
            if (f2.result.returnValue) {
              //now account is saved in db and all is good. :)
              log("Account saved successfully.");
            } else {
              log("Account save failed. :(");
            }
            finishAssistant({returnValue: f2.result.returnValue, success: f2.result.returnValue});
            //start a background sync:
            PalmCall.call("palm://info.mobo.syncml.client.service", "sync", account);
          });
        } else {
          log("Init failed" + JSON.stringify(future.result));
          finishAssistant({ returnValue: false, success: false });
        }
      } catch (e) { logError(e); }
    };
    
    //first initialize keymanager and old accounts:
    f = initialize({keymanager: true, accounts: true});
    f.then(this, initializeCallback);
  } catch (e) { logError(e); }
};
