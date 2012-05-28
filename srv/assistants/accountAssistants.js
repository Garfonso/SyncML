var getAccountsAssistant = function (future) {};

getAccountsAssistant.prototype.run = function (outerFuture) {
  log("============== getAccountsAssistant");
  var finishAssistant, logError, initializeCallback, f;
  try {
    outerFutures.push(outerFuture);
    finishAssistant = function (result) {
      finishAssistant_global({name: "getAccountsAssistant", outerFuture: outerFuture, result: result});
    };
    logError = function(e) {
      logError_global(e, "getAccountsAssistant");
      finishAssistant({returnVaule: false, success: false});
    };
    log("Params: " + JSON.stringify(this.controller.args));
    log("Future: " + JSON.stringify(outerFuture.result));
    
    if (!startAssistant({name: "getAccountsAssistant", outerFuture: outerFuture, run: this.run.bind(this) })){
      return;
    }
    
    initializeCallback = function (future) {
      try {
        if (future.result.returnValue === true) {
          log("Init complete");
          
          var accounts = SyncMLAccount.getAccounts();
          log("Returning " + accounts.length + " accounts");
          finishAssistant({returnValue: true, success: true, accounts: accounts});
        } else {
          log("Init failed" + JSON.stringify(future.result));
          finishAssistant({ returnValue: false, success: false });
        }
      } catch (e) {
        logError(e);
      }
    };
    
    //first initialize keymanager and accounts:
    f = initialize({keymanager: true, accounts: true, accountsInfo: true});
    f.then(this, initializeCallback);
  } catch (e) {
    logError(e);
  }
};

var storeAccountsAssistant = function (future) {};

storeAccountsAssistant.prototype.run = function (outerFuture) {
  log("============== storeAccountsAssistant");
  var finishAssistant, logError, initializeCallback, checkFinish = undefined, toAdd = [], toDelete = [], toModify = [],
      f, i, creates = 0, modifies = 0, wait = 0, deletes = 0, accounts = this.controller.args.accounts, saveCallback;
  try {
    outerFutures.push(outerFuture);
    finishAssistant = function (result) {
      finishAssistant_global({name: "storeAccountsAssistant", outerFuture: outerFuture, result: result});
    };
    logError = function(e) {
      logError_global(e, "storeAccountsAssistant");
      finishAssistant({returnVaule: false, success: false});
    };
    //log("Params: " + JSON.stringify(this.controller.args));
    log("Future: " + JSON.stringify(outerFuture.result));
    
    if (!startAssistant({name: "storeAccountsAssistant", outerFuture: outerFuture, run: this.run.bind(this) })){
      return;
    }
  
    if (typeof this.controller.args.accounts !== "object") {
      log("Need parameter accounts to be of type object, not " + typeof this.controller.args.accounts);
      finishAssistant({ returnValue: false, success: false });
      return;    
    }

    checkFinish = function() {
      try {
        if(creates === 0 && modifies === 0 && deletes === 0) {
          SyncMLAccount.saveConfig().then(function (f) {
            log("SaveConfig finished, return future");
            finishAssistant({ returnValue: f.result.returnValue, success: f.result.returnValue});
          });
        } else {
          log("Saves not finished, yet. Waiting for " + creates + " creates and " + modifies + " modifications and " + deletes + " deletes.");
          wait += 1;
          if (wait > 50) {
            log("Waited long enough, continue...");
            creates = 0;
            modifies = 0;
            deletes = 0;
          }
          setTimeout (checkFinish, 100);
        }
      } catch (e) {
        logError(e);
      }
    };
    
    saveCallback = function (future) {
      log("saveCallback!");
      try {
        for (i = 0; i < toAdd.length; i += 1) {
          log("Account " + i + " of " + accounts.length + " is new. Calling create");
          //this sometimes creates multiple accounts in my app... don't understand why, yet. 
          //But it seems necessary for webOS 2.1.x to work properly.
          SyncMLAccount.createAccount(toAdd[i]).then(this, function(future) {
            try {
              creates -= 1;
              if (!future.result.returnValue) {
                log("Could not create account...?");
              }
            } catch (e) {
              logError(e);
            }
          });
          creates += 1;
        }
        for (i = 0; i < toModify.length; i += 1) {
          SyncMLAccount.setAccount(toModify[i]);
          SyncMLAccount.modifyAccount(toModify[i]).then(function (f) {
            try {
              modifies -= 1;
            } catch (e) {
              logError(e);
            }
          });
          modifies += 1;
        }
        for (i = 0; i < toDelete.length; i += 1) {
          SyncMLAccount.deleteAccount(toDelete[i]).then(this, function (f) {
            try {
              deletes -= 1;
            } catch (e) {
              logError(e);
            }
          });
          deletes += 1;
        }
        checkFinish();
      } catch (e) {
        logError(e);
      }
    };
    
    initializeCallback = function (future) {
      try {
        if (future.result.returnValue === true) {
          log("Init complete");
          
          log("Processing " + accounts.length + " accounts.");
          for (i = 0; i < accounts.length; i += 1) {
            if (accounts[i].index >= 0 && accounts[i].accountId) { //already known account!
              if (accounts[i].deleteThis) {
                log("Deleting account " + i + " of " + accounts.length);
                toDelete.push(accounts[i]);
              } else {
                SyncMLAccount.setAccount(accounts[i]);
                log("Account " + i + " of " + accounts.length + " already exists. Calling modify");
                if (accounts[i].isModified) {
                  toModify.push(accounts[i]);
                  accounts[i].isModified = false;
                }
              }
            } else {
              if (accounts[i].username && accounts[i].password && accounts[i].name && accounts[i].url) {
                if (!accounts[i].index || accounts[i].index < 0) {
                  SyncMLAccount.addNewAccount(accounts[i], false); //don't write directly into database.
                }
                toAdd.push(accounts[i]);
              } else {
                log("Account not properly defined, ignoring.");
              }
            }
          }
          
          SyncMLAccount.saveConfig().then(this, saveCallback);
        } else {
          log("Init failed" + JSON.stringify(future.result));
          finishAssistant({ returnValue: false, success: false });
        }
      } catch (e) {
        logError(e);
      }
    };
    
    //first initialize keymanager and accounts:
    f = initialize({keymanager: true, accounts: true, accountsInfo: true});
    f.then(this, initializeCallback);
  } catch (e) {
    logError(e);
  }
};

var resetServiceAssistant = function (future) {};

resetServiceAssistant.prototype.run = function (outerFuture) {
  log("Service Locked: " + locked + " syncs.");
  log("Will try to exit service now.");
  process.exit(0);
  log("This should not get printed, right?");
};
