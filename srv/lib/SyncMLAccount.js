//nomen: true needed to accept _id.
/*global DB, log, PalmCall, KeyManager, Future */


var SyncMLAccount = (function () {
  var version = 2,
    savedFields = ["url", "name", "datastores", "accountId", "username_enc", "password_enc", "deviceName", "syncInterval", "dbWatch"],
    dsNames = ["calendar", "contacts"],
    savedFieldsDS = ["path", "method", "dbId", "enabled"],
    savedFieldsDSSync = ["next", "serverNext", "lastRev", "serverType", "serverId"],
//  currentAccount = { //account object!
//      //keystore!
//      //from user during account creation:
//      username: undefined,
//      password: undefined,
//      url: undefined,
//      name: "",
//      
//      datastores: {
//        calendar: {
//          //set by user for account creation:
//          path: "", //the server path
//          method: "", //sync method "slow", "two-way",... see SyncML.js.
//          //set by sync process:
//          next: 0,
//          serverNext: 0,
//          //used by db methods:
//          //set by account / capability creation:
//          dbId: undefined,
//          lastRev: 0
//        }, 
//        contacts: {
//          path: "",
//          method: "",
//          next: 0,
//          serverNext: 0,
//          //used by db methods:
//          //set by account / capability creation:
//          dbId: undefined,
//          lastRev: 0
//        }
//      },
//      
//      //account information necessary for webOs:
//      accountId: undefined,
//      //id in database, used for faster database modifications. Set during find.
//      dbId: undefined,
//      index: -1
//  }, 
    currentAccount = 0,
    accounts = [];

  //local functions:
  //used to create a capabilities array.
  function getCapabilities(account) {
    var caps = [];

    if (account.datastores && account.datastores.calendar && account.datastores.calendar.enabled) {
      caps.push({ "id": "info.mobo.syncml.calendar", "capability": "CALENDAR" });
    }
    if (account.datastores && account.datastores.contacts && account.datastores.contacts.enabled) {
      caps.push({ "id": "info.mobo.syncml.contact", "capability": "CONTACTS" });
    }

    log("Capabilitproviders: " + JSON.stringify(caps));
    return caps;
  }

  //used to read capabilities.
  function parseCapabilities(account, caps) {
    var i;

    if (!account.datastores) {
      account.datastores = {};
    }
    if (!account.datastores.calendar) {
      account.datastores.calendar = {};
    }
    if (!account.datastores.contacts) {
      account.datastores.contacts = {};
    }
    
    account.datastores.calendar.enabled = false;
    account.datastores.contacts.enabled = false;
    for (i = 0; i < caps.length; i += 1) {
      if (caps[i].capability === "CALENDAR") {
        account.datastores.calendar.enabled = true;
        log("Calendar cap set, will sync calendar");
      } else if (caps[i].capability === "CONTACTS") {
        account.datastores.contacts.enabled = true;
        log("Contact cap set, will sync contacts");
      }
    }
    log("Now have datastores in account: " + JSON.stringify(account.datastores));
  }

  return {
    //returns the currently processed account, or the account of index or a new one if no valid account is selected:
    getAccount: function (index) {
      //log("Get account called. current: " + currentAccount + ", index: " + index + ", accounts: " + accounts.length);
      index = parseInt(index, 10);
      if (typeof index === "number" && isFinite((index))) {
        //log("Setting currentAccount to " + index);
        currentAccount = index;
        //log("CA: " + currentAccount);
      }
      if (typeof index === "undefined") {
        currentAccount = 0;
      }
      if (currentAccount >= 0 && currentAccount < accounts.length) {
        //log("Returning account " + currentAccount);
        return accounts[currentAccount];
      } else {
        //return a new account.
        //log("Returning new account with index " + accounts.length);
        return undefined; 
      }
    },
    
    getAccountById: function(id) {
      for (var i = 0; i  < accounts.length; i += 1) {
        if (accounts[i].accountId === id) {
          currentAccount = i;
          return accounts[i];
        }
      }
      //return {index: accounts.length};
    },
    
    getAccountByName: function(name) {
      for (var i = 0; i  < accounts.length; i += 1) {
        if (accounts[i].name === name) {
          currentAccount = i;
          return accounts[i];
        }
      }
      //return {index: accounts.length};
    },

    getAccounts: function() {
      return accounts;
    },

    //saves a modified version of the currenctly processed account:
    setAccount: function (account) {
      if (account) {
        if (account.index >= 0) {
          accounts[account.index] = account;
        }
      }
    },

    //will make the next account from db current. if undefined there are no accounts anymore.
    getNextAccount: function () {
      //log("Get next account called");
      if (currentAccount >= 0 && currentAccount < accounts.length) {
        currentAccount += 1;
        return accounts[currentAccount];
      }
    },
    
    addNewAccount: function (account, saveAccounts) {
      account.index = accounts.length;
      accounts[accounts.length] = account;
      if (saveAccounts) {
        return this.saveConfig();
      }
    },
    
    removeAccount: function (account) {
      if (account.index >= 0 && account.index < accounts.length) {
        var b = accounts[account.index];
        if(b.name === account.name) {
          log("Deleting " + b.name);
          accounts.splice(account.index, 1);
          for (var i = account.index; i < accounts.length; i += 1) {
            log("Updating index of " + accounts[i].index + " to " + i);
            accounts[i].index = i;
          }
          log ("Now having " + accounts.length + " account.");
        }
      }
    },

    //will save modifications to all accounts.
    saveConfig: function (syncEnd) {
      var newAccts = [], acctObj, field, i, j, k, ds, dsOrg, result, runningEnryptions = 0, 
          innerFuture = new Future(), outerFuture = new Future(), encryptionFinished, doSaveObjects, finishSave;
      encryptionFinished = function (future) {
        try {
          if (future.result.returnValue) {
            //log("Data got encrypted");
          } else {
            log("Encyption failed." + JSON.stringify(future.result));
          }
          runningEnryptions -= 1;
          log("Encryptions running: " + runningEnryptions);
          if (runningEnryptions === 0) {
            innerFuture.result = {returnValue: true};
          }
        } catch (e) {
          logError_lib(e);
        }
      };
      
      finishSave = function (future) { //this will add items without id set.
        try {
          result = future.result;
          if (result.returnValue === true) {
            log("Successfully put accounts into db.");
            if (newAccts.length !== result.results.length) {
              log("Something is wrong, got " + result.results.length + " ids, but have " + accounts.length + " objects.");
            } else {
              for (i = 0; i < result.results.length; i += 1) {
                accounts[i].dbId = result.results[i].id;
              }
            }
            outerFuture.result = {returnValue: true};
          } else {
            log("Put account failure: Err code=" + JSON.stringify(future.result) + " and " + JSON.stringify(future.exception));
            outerFuture.result = {returnValue: false};
          }
        } catch(e) {
          logError_lib(e);
        }
      };
      
      doSaveObjects = function (future) {
        try {
          if (newAccts.length > 0) {
            //log("Saving " + newAccts.length + " objects.");
            if (future.result.returnValue === true) {
              var future_ = DB.merge(newAccts);
              future_.then(this, finishSave);
              future_.onError(function (f) {
                log("Error in saveConfig-future: " + f.exeption);
                logToApp("Could not load save account config: " + JSON.stringify(f.exeption));
                future_.result = { returnValue: false };
              });
            } else { //future not successfull.
              log("Something went wrong during saveAccount: " + JSON.stringify(future.result));
            }
          } //had newAccts
        } catch (e) {
          logError_lib(e);
        }
      };
      
      try {
        log("SaveConfig called!!!");
        //sort in modified and new,
        for (i = 0; i < accounts.length; i += 1) {
          if (!accounts[i].isDeleted) {  
            acctObj = {"_kind": "info.mobo.syncml.account:1", "_id": accounts[i].dbId};
            for (field = 0; field < savedFields.length; field += 1) {
              if (savedFields[field] === "datastores") {
                acctObj.datastores = {};
                for (j = 0; j < dsNames.length; j += 1) {
                  ds = {};
                  dsOrg = accounts[i].datastores[dsNames[j]];
                  if (dsOrg) {
                    for (k = 0; k < savedFieldsDS.length; k += 1) {
                      ds[savedFieldsDS[k]] = dsOrg[savedFieldsDS[k]];
                    }
                    if (syncEnd) { //only save some of the fields, if the save comes from the end of a sync.
                      for (k = 0; k < savedFieldsDSSync.length; k += 1) {
                        ds[savedFieldsDSSync[k]] = dsOrg[savedFieldsDSSync[k]];
                      }
                    }
                    acctObj.datastores[dsNames[j]] = ds;
                  }
                }
              } else {
                acctObj[savedFields[field]] = accounts[i][savedFields[field]]; //copy data into db obj.
              }
            }
            //log("Obj to save: " + JSON.stringify(acctObj));
            if (acctObj.accountId || acctObj.username || acctObj.pw || acctObj.url) {
              log("Adding account " + acctObj.name);
              newAccts.push(acctObj);
              runningEnryptions += 2;
              KeyManager.encrypt("username", accounts[i].username, acctObj).then(encryptionFinished);
              KeyManager.encrypt("password", accounts[i].password, acctObj).then(encryptionFinished);
            }
          }
        }
        if (runningEnryptions === 0) { //no accounts found, break here.
          outerFuture.result = {returnValue: true};
          return outerFuture;
        }
        
        innerFuture.then(this, doSaveObjects);
      } catch (e) {
        log("Error: " + e.message + " - " + e.stack);
        log("Error: " + JSON.stringify(e));
      }
      return outerFuture;
    },

    //get the accounts
    findAccounts: function () {
      var query = {"from": "info.mobo.syncml.account:1"}, i, j, field, obj, result, innerFuture = new Future(), decrypts = 0, 
          outerFuture = new Future(), afterDecrypt, foundObjects, endFindAccounts;
      afterDecrypt = function (future) {
        try {
          if (future.result.returnValue === true) {
            //log("Decryption success");
          } else {
            log("Could not decrypt password of account");
          }
          decrypts -= 1;
          //log("Decrypts running: " + decrypts);
          if (decrypts === 0) {
            innerFuture.result = {returnValue: true, result: "AllPWsDecrypted"};
          }
        } catch (e) {
          logError_lib(e);
        }
      };
      
      endFindAccounts = function (future) {
        if (future.result.returnValue === true) {
          log("All accounts finished");
          outerFuture.result = {returnValue: true, success: true};
        } else {
          log("Something went wrong: " + JSON.stringify(future.exception));
        }
        innerFuture.result = {returnValue: future.result.returnValue, stage: "end"};
      };
      
      foundObjects = function (future) {
        try {
          result = future.result;
          //log("result: " + JSON.stringify(result));
          if (result.returnValue === true) {
            for (i = 0; i < result.results.length; i += 1) {
              obj = {};
              for (j = 0; j < savedFields.length; j += 1) {
                field = savedFields[j];
                obj[field] = result.results[i][field]; //copy saved data.
              }
              obj.dbId = result.results[i]._id;
              obj.index = accounts.length;
              //log("Got account: " + JSON.stringify(obj));
              accounts.push(obj);
              //log("Passwort: " + obj.password);
              KeyManager.decrypt("username",obj).then(afterDecrypt);
              KeyManager.decrypt("password",obj).then(afterDecrypt);
              decrypts += 2;
            }
            if (result.results.length === 0) { //no accounts found, break here.
              log("No accounts, return.");
              outerFuture.result = {returnValue: true, success: true};
              return outerFuture;
            }
            
            innerFuture.then(endFindAccounts);
          } else {
            result = future.exception;
            log("Put account failure: Err code=" + JSON.stringify(future.result) + " and " + JSON.stringify(future.exception));
          }
        } catch (e) {
          logError_lib(e);
        }
      };

      try {
        accounts = []; //clear accounts.
        DB.find(query, false, false).then(this, foundObjects);
      } catch (e) {
        logError_lib(e);
      }
      return outerFuture;
    },

    // this is not used??
    createAccount: function (account, callback) {
      var outerFuture = new Future();
      if (!account) {
        account = accounts[currentAccount];
      }
      if (!account.url || !account.username) {
        log("Need to specify at least url and username for syncml accounts! Won't create account");
        outerFuture.result = {returnValue: false};
        return outerFuture;
      }
      if (account.accountId) {
        log("Account already exists, calling modify instead.");
        this.modifyAccount(account);
        outerFuture.result = {returnValue: false};
        return outerFuture;
      }
      try {
        accObj = {
            "templateId"          : "info.mobo.syncml.account",
            "capabilityProviders" : getCapabilities(account),
            "username"            : account.username,
            "alias"               : account.name || "SyncML Account",
            "credentials"         : { "common": { "password" : account.password } }, //this is a bit strange.. account service stores this in a secure storage, but as of webOs 2.2.2 this is not accessible for me. :( So I store my own user/password.
            "beingDeleted"        : false,
            "config"              : {"url": account.url, datastores: account.datastores, name: account.name}
            };
        //log("accObj: " + JSON.stringify(accObj));
        var future_ = PalmCall.call("palm://com.palm.service.accounts/", "createAccount", accObj);
        future_.then(function (future) {
              try {
                if (future.result.returnValue === true) {
                  log("Account created!" + JSON.stringify(future.result));
                  account.accountId = future.result.result._id;
                  account.name = future.result.result.alias;
                  log("Got account Id: " + account.accountId);
                  SyncMLAccount.setAccount(account);
                  SyncMLAccount.saveConfig().then(function (f) {
                    outerFuture.result = {returnValue: true, account: account};
                  });
                } else {
                  log("Account creation failed. " + JSON.stringify(future.result));
                  outerFuture.result = {returnValue: false};
                }
              } catch (e) {
                logError_lib(e);
              }
            });
        future_.onError(function (f) {
          log("Error in createAccount-future: " + f.exeption);
          logToApp("Could not create account: " + JSON.stringify(f.exeption));
          future_.result = { returnValue: false };
        });
      } catch (e) { 
        logError_lib(e);
      }
      return outerFuture;
    },

    //this deletes an account from the database!
    deleteAccountFromDB: function (account) {
      var ids, field = "", outerFuture = new Future();
      if (!account) {
        account = SyncMLAccount.getAccount();
        if (!account) {
          outerFuture.result = {returnValue: false};
          return outerFuture;
        }
      }
      if (account.dbId) {
        ids = [account.dbId];
        for (field in account.datastores) {
          if (account.datastores.hasOwnProperty(field) && account.datastores[field].dbId) {
            ids.push(account.datastores[field].dbId);
          }
        }
        var future_ = DB.del(ids);
        future_.then(function (future) {
          try {
            if (future.result.returnValue === true) {
              log("del success!" + JSON.stringify(future.result));
              log("del #1, id=" + future.result.results[0].id + ", rev=" + future.result.results[0].rev);
              outerFuture.result = {returnValue: true};
              if (account.index) {
                SyncMLAccount.removeAccount(account);
              }
              account.isDeleted = true;
            } else {
              log("del failure! Err = " + JSON.stringify(future.result));
              outerFuture.result = {returnValue: false};
            }
          } catch (e) {
            logError_lib(e);
          }
        });
        future_.onError(function (f) {
          log("Error in delteAccountFromDB-future: " + f.exeption);
          logToApp("Could not delete account from DB: " + JSON.stringify(f.exeption));
          future_.result = { returnValue: false };
        });
      }
      return outerFuture;
    },

    //this deletes an account from the account service!
    deleteAccount: function (account) {
      log("Delete account from webOS called.");
      var outerFuture = new Future();
      if (!account) {
        account = SyncMLAccount.getAccount();
        if (!account) {
          outerFuture.result = {returnValue: false};
          return outerFuture;
        }
      }
      if (account.accountId) {
        var future_ = PalmCall.call("palm://com.palm.service.accounts/", "deleteAccount", {"accountId": account.accountId});
        future_.then(function (future) {
          try {
            if (future.result.returnValue === true) {
              log("delte account success" + JSON.stringify(future.result) + "\n");
              try {
                if (account.index >= 0 && account.index < accounts.length) {
                  accounts[account.index].accountId = undefined;
                }
              } catch (error) {
                log("Could not remove accountId from " + account.index + ".");
                log(JSON.stringify(error));
              }
              SyncMLAccount.deleteAccountFromDB(account).then(function (f) {
                outerFuture.result = f.result;
              });
            } else {
              log("Could not deleteAccount: " + JSON.stringify(future.result));
              outerFuture.result = {returnValue: false};
            }
          } catch (e) {
            logError_lib(e);
          }
        });
        future_.onError(function (f) {
          log("Error in deleteAccount-future: " + f.exeption);
          logToApp("Could not deleteAccount: " + JSON.stringify(f.exeption));
          future_.result = { returnValue: false };
        });
      } else {
        return SyncMLAccount.deleteAccountFromDB(account);
      }
      return outerFuture;
    },

    getAccountInfo: function (account) {
      var outerFuture = new Future(), future_;
      if (!account) {
        account = SyncMLAccount.getAccount();
        if (!account) {
          outerFuture.result = {returnValue: false, account: account};
          return outerFuture;
        }
      } else if (!account.accountId) {
        //don't have created an account with webOs, yet.. only my object seems to exist right now.
        outerFuture.result = {returnValue: false, account: account};
      } else {
        future_ = PalmCall.call("palm://com.palm.service.accounts/", "getAccountInfo", {"accountId": account.accountId});
        future_.then(function (future) {
          try {
            if (future.result.returnValue === true) {
              log("getAccountInfo success" + JSON.stringify(future.result) + "\n");
              account.name = future.result.result.alias;
              if (future.result.result.beingDeleted) {
                log("Account " + account.name + " marked for deletion, will remove accountId.");
                delete account.accountId;
              }
              parseCapabilities(account, future.result.result.capabilityProviders);
              if (future.result.result.username) {
                //log("got username: " + future.result.result.username);
                account.username = future.result.result.username;
              }
              SyncMLAccount.setAccount(account);
            } else {
              delete account.accountId;
              log("getAccountInfo failure: " + JSON.stringify(future.result));
            }
            outerFuture.result = {returnValue: future.result.returnValue, account: account};
          }
          catch (e) {
            logError_lib(e);
          }
        });
        future_.onError(function (f) {
          log("Error in getAccountInfo-future: " + f.exeption);
          logToApp("Could not get account info: " + JSON.stringify(f.exeption));
          future_.result = { returnValue: false };
        });
      }
      return outerFuture;
    },

    //can be used to change capabilities, too:
    modifyAccount: function (account) {
      var outerFuture = new Future();
      if (!account) {
        account = SyncMLAccount.getAccount();
        if (!account) {
          outerFuture.result = { returnValue: false};
          return outerFuture;
        }
      }
      if (!account.accountId) {
        log("Account not created, calling create instead of modify.");
        return SyncMLAccount.createAccount(account);
//      outerFuture.result = { returnValue: false};
//      return outerFuture;
      }
      try {
        log("modifying account " + account.name);
        var future_ = PalmCall.call("palm://com.palm.service.accounts/", "modifyAccount",
            {
          "accountId": account.accountId,
          object:
          {
            "username": account.username,
            "capabilityProviders": getCapabilities(account),
            "alias": account.name,
            "credentials":
            {
              "common": { "password": account.password }
            },
            "config":
            {
              "url": account.url,
              "datastores": account.datastores
            } //this will go to transport service...??? Why don't I get that with getAccountInfo? :(
          }
            });
        future_.then(this, function (future) {
          try {
            if (future.result.returnValue === true) {
              log("Account modified = " + JSON.stringify(future.result));
            } else {
              log("modifiyAccount failure: " + JSON.stringify(future.result));
            }
            outerFuture.result = { returnValue: future.result.returnValue};
          } catch (e) {
            logError_lib(e);
          }
        });
        future_.onError(function (f) {
          log("Error in modifyAccount-future: " + f.exeption);
          logToApp("Could not modify account: " + JSON.stringify(f.exeption));
          future_.result = { returnValue: false };
        });
      } catch (error) {
        log("Error in modify account: " + error.name);
        log(JSON.stringify(error));
        outerFuture.result = { returnValue: false};
      }
      return outerFuture;
    }
  }; //end of public interface.
}()); //self infocation.
