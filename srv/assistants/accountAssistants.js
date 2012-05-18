var getAccountsAssistant = function (future) {};

getAccountsAssistant.prototype.run = function (outerFuture) {
  log("============== getAccountsAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(future.outerFuture));
  
  if (locked === true) {
    log("Locked... already running?");
    outerFuture.result = { returnValue: false, notStarted: true };
    return;
  }
  
  locked = true;
  //first initialize keymanager and accounts:
  var f = initialize({keymanager: true, accounts: true, accountsInfo: true});
  f.then(this, function (future) {
    if (future.result.returnValue === true) {
      log("Init complete");

      var accounts = [];
      var account = SyncMLAccount.getAccount();
      while (account) {
        accounts.push(account);
        account = SyncMLAccount.getNextAccount();
      }
      log("Returning " + accounts.length + " accounts");
      outerFuture.result = {returnValue: true, accounts: accounts};
      locked = false;
    } else {
      log("Init failed" + JSON.stringify(f.result));
      outerFuture.result = {returnValue: false};
      locked = false;
    }
  });
};

var storeAccountsAssistant = function (future) {};

storeAccountsAssistant.prototype.run = function (outerFuture) {
  log("============== storeAccountsAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(future.outerFuture));
  
  if (locked === true) {
    log("Locked... already running?");
    outerFuture.result = { returnValue: false, notStarted: true };
    return;
  }
  
  if (typeof this.controller.args.accounts !== "array") {
    log("Need parameter accounts to be of type array, not " + typeof this.controller.args.accounts);
    outerFuture.result = { returnValue: false, notStarted: true };
    return;    
  }

  locked = true;
  //first initialize keymanager and accounts:
  var f = initialize({keymanager: true, accounts: true, accountsInfo: true});
  f.then(this, function (future) {
    if (future.result.returnValue === true) {
      log("Init complete");

      var accounts = this.controller.args.accounts;
      log("Processing " + accounts.length + " accounts.");
      for (var i = 0; i < accounts.length; i += 1) {
        if (accounts[i].index >= 0) { //already known account!
          SyncMLAccount.setAccount(accounts[i]);
          log("Account " + i + " of " + accounts.length + " already exists. Calling modify");
          SyncMLAccount.modifyAccount(accounts[i]);
        } else {
          SyncMLAccount.addNewAccount(accounts[i], false); //don't write directly into database.
          log("Account " + i + " of " + accounts.length + " is new. Calling create");
          SyncMLAccount.createAccount(accounts[i]);
        }
      }

      log("All save processes started.");
      outerFuture.result = {returnValue: true};
      locked = false;
    } else {
      log("Init failed" + JSON.stringify(f.result));
      outerFuture.result = {returnValue: false};
      locked = false;
    }
  });
};
