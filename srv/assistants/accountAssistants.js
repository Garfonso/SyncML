var getAccountsAssistant = function (future) {};

getAccountsAssistant.prototype.run = function (outerFuture) {
  log("============== getAccountsAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(outerFuture.result));
  
  if (locked === true) {
    log("Locked... already running?");
    previousOperationFuture.then(this, function (f) {
      log("PreviousOperation finished " + JSON.stringify(f.result) + " , starting getAccountsAssistant");
      this.run(outerFuture);
    });
    return;
  }
  
  locked = true;
  //first initialize keymanager and accounts:
  var f = initialize({keymanager: true, accounts: true, accountsInfo: true});
  f.then(this, function (future) {
    if (future.result.returnValue === true) {
      log("Init complete");

      var accounts = SyncMLAccount.getAccounts();
      log("Returning " + accounts.length + " accounts");
      finishAssistant(outerFuture, {returnValue: true, accounts: accounts});
    } else {
      log("Init failed" + JSON.stringify(f.result));
      finishAssistant(outerFuture, { returnValue: false });
    }
  });
};

var storeAccountsAssistant = function (future) {};

storeAccountsAssistant.prototype.run = function (outerFuture) {
  log("============== storeAccountsAssistant");
  //log("Params: " + JSON.stringify(this.controller.args)); //dangerous: can contain password!
  log("Future: " + JSON.stringify(outerFuture.result));
  
  if (locked === true) {
    log("Locked... already running?");
    previousOperationFuture.then(this, function (f) {
      log("PreviousOperation finished " + JSON.stringify(f.result) + " , starting storeAccountsAssistant");
      this.run(outerFuture);
    });
    return;
  }
  
  if (typeof this.controller.args.accounts !== "object") {
    log("Need parameter accounts to be of type object, not " + typeof this.controller.args.accounts);
    finishAssistant(outerFuture, { returnValue: false });
    return;    
  }

  //first initialize keymanager and accounts:
  locked = true;
  var f = initialize({keymanager: true, accounts: true, accountsInfo: true});
  f.then(this, function (future) {
    if (future.result.returnValue === true) {
      log("Init complete");
      var creates = 0, modifies = 0, wait = 0;

      var accounts = this.controller.args.accounts;
      log("Processing " + accounts.length + " accounts.");
      for (var i = 0; i < accounts.length; i += 1) {
        if (accounts[i].index >= 0) { //already known account!
          if (accounts[i].deleteThis) {
            //TODO: check if account already existed and then delete webOs account?
            log("Deleting account " + i);
            SyncMLAccount.removeAccount(accounts[i]);
          }
        }
        //this creates issues... don't know how to solve them, right now.. therefore:  deacitvated and done on first sync.
//          SyncMLAccount.setAccount(accounts[i]);
//          log("Account " + i + " of " + accounts.length + " already exists. Calling modify");
//          SyncMLAccount.modifyAccount(accounts[i]).then(function (f) {
//            modifies -= 1;
//          });
//          modifies += 1;
//        } else {
//          if (accounts[i].username && accounts[i].password && accounts[i].name && accounts[i].url) {
//            SyncMLAccount.addNewAccount(accounts[i], false); //don't write directly into database.
//            log("Account " + i + " of " + accounts.length + " is new. Calling create");
//            SyncMLAccount.createAccount(accounts[i], function() {
//              creates -= 1;
//            });
//            creates += 1;
//          } else {
//            log("Account not properly defined, ignoring.");
//          }
//        }
      }

      var checkFinish = function() {
        if(creates === 0 && modifies === 0) {
          SyncMLAccount.saveConfig().then(function (f) {
            log("SaveConfig finished, return future");
            finishAssistant(outerFuture, { returnValue: f.result.returnValue});
          });
        } else {
          log("Saves not finished, yet. Waiting for " + creates + " creates and " + modifies + " modifications");
          wait += 1;
          if (wait > 50) {
            log("Waited long enough, continue...");
            creates = 0;
            modifies = 0;
          }
          setTimeout (checkFinish, 100);
        }
      };
      checkFinish();
    } else {
      log("Init failed" + JSON.stringify(f.result));
      finishAssistant(outerFuture, { returnValue: false });
    }
  });
};

var resetServiceAssistant = function (future) {};

resetServiceAssistant.prototype.run = function (outerFuture) {
  log("Service Locked: " + locked);
  log("Will try to exit service now.");
  process.exit(0);
  log("This should not get printed, right?");
};
