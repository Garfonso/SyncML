/*global Future, SyncMLAccount, log, eventCallbacks, outerFutures, finishAssistant_global, logSubscription, logError_global, startAssistant, logToApp, SyncML, initialize, PalmCall, contactCallbacks */

var syncAssistant = function (future) {
};

syncAssistant.prototype.finished = function (account) {
  var outerFuture = new Future(), saveAccounts, checkRevsResult, calendar, contacts, innerFuture = new Future(), res;

  saveAccounts = function () {
    SyncMLAccount.setAccount(account);
    log("Saving config to store new revs.");
    SyncMLAccount.saveConfig(true).then(function (f) {
      log("StoreAccounts returned.");
      outerFuture.result = { returnValue: f.result.returnValue };
    });
  };

  checkRevsResult = function (f) {
    if (f.result && f.result.calendar && f.result.contacts) {
      saveAccounts();
    } else {
      //log("Cleanup not finished, yet: " + JSON.stringify(f.result));
      f.then(checkRevsResult);
    }
  };

  if (account.datastores.calendar && account.datastores.calendar.enabled) {
    calendar = account.datastores.calendar;
    eventCallbacks.finishSync(account, innerFuture);
    if (calendar.ok === true) {
      log("Calendar sync worked, rev: " + calendar.lastRev);
    } else {
      log("Calendar sync had errors.");
    }
  } else {
    res = innerFuture.result;
    if (!res) {
      res = {};
    }
    res.calendar = true;
    innerFuture.result = res;
  }
  if (account.datastores.contacts && account.datastores.contacts.enabled) {
    contacts = account.datastores.contacts;    
    contactCallbacks.finishSync(account, innerFuture);
    if (contacts.ok === true) {
      log("Contacts sync worked, rev: " + contacts.lastRev);
    } else {
      log("Contacts sync had errors.");
    }
  } else {
    res = innerFuture.result;
    if (!res) {
      res = {};
    }
    res.contacts = true;
    innerFuture.result = res;
  }

  innerFuture.then(this, checkRevsResult);
  return outerFuture;
};

syncAssistant.prototype.run = function (outerFuture, subscription) {
  log("============== syncAssistant");
  var finishAssistant, logError, initializeCallback, syncCallback, finishCallback, checkAccountCallback,
    f, args = this.controller.args, account = this.controller.args, accountId, that = this;
  log("Activity: " + JSON.stringify(this.controller.args.$activity));
  //log("args: " + JSON.stringify(args));
  if (args.$activity && args.$activity.trigger && args.$activity.trigger.returnValue === false) {
    log("Error with activity: " + JSON.stringify(args));
    return;
  }
  if (args.$activity && args.$activity.name && args.$activity.name.indexOf("watch") >= 0 && args.$activity.name.indexOf(".delayed") === -1) {
    log("Watch fired, delaying a few minutes till changes are completed.");
    initialize({accounts: true}).then(this, function (future) {
      //get account:
      var a2 = SyncMLAccount.getAccountById(account.accountId);
      if (!a2) {
        a2 = {accountId: account.accountId};
      }
      log("Got account: " + a2.name);
      this.delaySync(a2, args.$activity.name);
      //will retrigger watchActivity in onComplete.
      eventCallbacks.getLatestRev(a2).then(this, function (f2) {
        var rev = 0;
        if (f2.result.returnValue) {
          rev = f2.result.rev;
        } else {
          log("Could not get lastRev from DB! Result: " + JSON.stringify(f2.result));
        }
        log("Retrigger watch with rev " + rev);
        this.retriggerActivities(args.$activity, a2, rev);
        outerFuture.result = {returnValue: true};
      });
    });
    return;
  }
	finishAssistant = function (result) {
		finishAssistant_global({name: "syncAssistant", outerFuture: outerFuture, result: result, accountId: accountId});
		logSubscription = undefined; //delete subscription.
	};
	logError = function (e) {
		logError_global(e, "syncAssistant");
		finishAssistant({finalResult: true, returnVaule: false, success: false});
	};

  try {
    outerFutures.push(outerFuture);
    accountId = args.accountId;
		if (this.controller.args.$activity) {
			this.controller.args.$activity.accountId = accountId;
		}
    if (!accountId) {
      accountId = "noId";
    }
    //log("Params: " + JSON.stringify(this.controller.args));
    log("Future: " + JSON.stringify(outerFuture.result));

    if (!startAssistant({name: "syncAssistant", outerFuture: outerFuture, accountId: accountId, run: this.run.bind(this) })) {
      delete outerFuture.result;
      if (subscription) {
        logSubscription = subscription; //cool, seems to work. :)
        logToApp("Sync of this account already running, connecting output to app.");
				return;
      } else {
				outerFuture.then(this.run.bind(this));
			}
    }

    if (!args.accountId && args.index < 0 && !args.name) {
      log("Need accountId or account.index or account.name to sync!");
      finishAssistant({ finalResult: true, success: false, reason: "Parameters not sufficient. " + JSON.stringify(args) });
      return;
    }

    //disable activities until we are finished with sync:
    //checkActivities({name: account.name}); //TODO: move this to initialization and wait for the callbacks to return. Here VERY wrong for activities themselfes!!! :(


    finishCallback = function (f) {
		  try {
				log("Reached finishCallback.");
				if (account.doImmediateRefresh) {
					//manually log
					var f = logSubscription.get();
					f.result = { msg: "Need to do refresh. Do that now.", account: account };
					checkAccountCallback({result: {returnValue: true}});
					return;
				}
			
				if (f.result.returnValue === true) {
					log("Success, returning to client");
					finishAssistant({ finalResult: true, success: true, reason: "All went well, updates", account: account});
				} else {
					log("Failure, returning to client");
					finishAssistant({ finalResult: true, success: false, reason: "Failure in cleanup, expect trouble with next sync."});
				}
			} catch (e) {
				logError(e);
				finishAssistant({ finalResult: true, success: false, reason: "Failure in cleanup, got an exception: " + e.name + " - " + e.message});
			}
    };

    syncCallback = function (result) {
      try {
        log("Sync came back.");
        if (result.success === true) {
          that.finished(account).then(finishCallback);
        } else {
          finishAssistant({ finalResult: true, success: false, reason: "Internal sync error." });
        }
      } catch (e) {
        logError(e);
      }
    };

    checkAccountCallback = function (f3) {
      try {
        if (f3.result.returnValue === true) {
          log("Finishing initialization of SyncML framework.");
          SyncML.initialize(account);
          SyncML.setCallbacks([
            {
              name: "calendar",
              //needs to get all calendar data and call callback with { update: [ all data here ] }, callback
              getAllData: eventCallbacks.getAllEvents,
              //needs to get only new calendar data and call callback with { update: [modified], add: [new], del: [deleted] }, callback
              getNewData: eventCallbacks.getNewEvents,
              //this will be called on refresh from server to delete all local data. Call callback with {}.
              deleteAllData: eventCallbacks.deleteAllEvents,
              //Param: {type: add, callback, globalId: ..., item: new item data }. call callback with {type: add, globalId: ..., localId: ... success: true/false }
              newEntry: eventCallbacks.createEvent,
              //Param: {type: update, callback, localId: ..., item: new data }. Call callback with { type: update, globalId: ..., localId: ... success: true/false }.
              updateEntry: eventCallbacks.updateEvent,
              //Param: { type: del, callback, localId: ... }. Call callback with { type: del, globalId: ..., localId: ... success: true/false }. 
              delEntry: eventCallbacks.deleteEvent
            },
            {
              name: "contacts",
              //needs to get all calendar data and call callback with { update: [ all data here ] }, callback
              getAllData: contactCallbacks.getAllContacts,
              //needs to get only new calendar data and call callback with { update: [modified], add: [new], del: [deleted] }, callback
              getNewData: contactCallbacks.getNewContacts,
              //this will be called on refresh from server to delete all local data. Call callback with {}.
              deleteAllData: contactCallbacks.deleteAllContacts,
              //Param: {type: add, callback, globalId: ..., item: new item data }. call callback with {type: add, globalId: ..., localId: ... success: true/false }
              newEntry: contactCallbacks.createContact,
              //Param: {type: update, callback, localId: ..., item: new data }. Call callback with { type: update, globalId: ..., localId: ... success: true/false }.
              updateEntry: contactCallbacks.updateContact,
              //Param: { type: del, callback, localId: ... }. Call callback with { type: del, globalId: ..., localId: ... success: true/false }. 
              delEntry: contactCallbacks.deleteContact
            }
            ]);
          log("SyncML initialized.");
          logToApp("SyncML completely initialized, starting sync process.");
          SyncML.sendSyncInitializationMsg(syncCallback);
        } else {
          log("check and creation of accounts and calendar did not work.");
          finishAssistant({ finalResult: true, success: false, reason: "Could not create/check account/calendar." });
        }
      } catch (e) {
        logError(e);
      }
    };

    initializeCallback = function (f2) {
			try {
				if (f2.result.returnValue === true) {
					log("initialize.result: " + JSON.stringify(f2.result));

					log("Starting sync");
					if (!account.doImmediateRefresh) { //already have full account as param. Avoid overriding of doImmediateRefresh field.
						if (account && account.accountId) {
							account = SyncMLAccount.getAccountById(account.accountId);
						} else if (account.index >= 0) {
							account = SyncMLAccount.getAccount(account.index);
						} else if (account.name) {
							account = SyncMLAccount.getAccountByName(account.name);
						}
						if (args.$activity && account && account.accountId) {
							args.$activity.accountId = account.accountId;
						}
					}

					if (!account || !account.username || !account.password || !account.url) {
						log("Account seems to be not fully configured. Can't sync.");
						log("Account: " + JSON.stringify(account));
						finishAssistant({ finalResult: true, success: false, reason: "Account not fully configured: " + JSON.stringify(account) });
						return;
					}

					that.checkAccount(account).then(checkAccountCallback);
				} else {
					log("Initialization failed... :(");
					finishAssistant({ finalResult: true, success: false, reason: "Initialization failed." });
				}
			} catch (e) {
				logError(e);
			}
      //return future;
    };

    logSubscription = subscription;
    try {
      f = initialize({devID: true, keymanager: true, accounts: true, accountsInfo: true, iCal: true, vCard: true});
      f.then(initializeCallback);
    } catch (e1) {
      logError(e1);
    }
  } catch (e) {
    logError(e);
  }
};

syncAssistant.prototype.checkAccount = function (account) {
  var future = new Future();
  log("Check account");
  if (account.accountId !== undefined) {
    log("Have account Id: " + account.accountId);
    SyncMLAccount.getAccountInfo(account).then(this, function (f) {
      var result = f.result;
      if (result.account && result.account.accountId) {
        eventCallbacks.checkCalendar(result.account).then(function (f) {
          future.result = f.result;
        });
      } else {
        this.checkAccount(account).then(function (f2) {
          future.result = f2.result;
        }); //try to create account.
      }
    });
  } else {
    log("Need to create account.");
    SyncMLAccount.createAccount(account).then(this, function (f1) {
      if (f1.result.returnValue) {
        log("Account created.");
        eventCallbacks.checkCalendar(f1.result.account).then(function (f2) {
          future.result = f2.result;
        });
      } else {
        log("Could not create account.");
        throw {name: "AccountError", message: "Could not create account."};
      }
    });
  }
  return future;
};

syncAssistant.prototype.delaySync = function (account, name) {
  //log("Account: " + JSON.stringify(account));
  log("Delay: " + name);
  //try {
  var activityType = {
      //foreground: true,
      background: true, //try background. Idea: user does something in calendar, and as soon as she finishes, push that to server.
      //immediate: true,
      //priority: "low",
      pausable: false, //we don't like to be paused, after all that is communication with the server. :(
      cancellable: false, //that is even worse!
      power: true, //do we really need that?
      powerDebounce: true,
      explicit: false, //let's try it this way.. hm.
      persist: true //we want to keep that activity around!
    },
    activityCallback = {
      method: "palm://info.mobo.syncml.client.service/sync",
      params: { accountId: account.accountId } //prevent password and so on from being stored in another DB. AccountID is sufficient here.
    };

  //calendar watch:
  PalmCall.call("palm://com.palm.activitymanager/", "cancel", { activityName: name + ".delayed" }).then(function (f) {
    log("Cancelled delayed activity for " + account.name + ", " + name + ".delayed.");
    var date = new Date(), activityCal;
    date.setMinutes(date.getMinutes()+1);
    activityCal = {
        name: name + ".delayed",
        description: "Synergy SyncML delayed watch activity",
        type: activityType,
        requirements: {
          internetConfidence: "excellent"
        },
        schedule: { 
          "start"    : date.getFullYear() + "-" + (date.getMonth()+1) + "-" + date.getDate() + " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds(),
          "local"    : true
        },
        callback: activityCallback
      };
    log("Adding delayed activity at " + activityCal.schedule.start);
    PalmCall.call("palm://com.palm.activitymanager/", "create", { start: true, replace: true, activity: activityCal }).then(function (f1) {
      log("delayed activity for " + name + " created.");
      log(JSON.stringify(f1.result));
    });
  });
};

syncAssistant.prototype.retriggerActivities = function(activity, account, rev) {
  log("Retriggering activity " + typeof activity === "undefined" ? "undefined" : activity.name);
  var restart = true, trigger; //restart all except delayed.
  if (activity && activity.trigger && activity.trigger.returnValue && account) {
    if (activity.name.indexOf(".delayed") > 0) {
      log("Delayed activity " + activity.name + " finished. Won't restart.");
      restart = false;
    } else if (activity.name === "info.mobo.syncml:" + account.name + ".watchCalendar") {
      trigger = { method: "palm://com.palm.db/watch", key: "fired",
            params: { subscribe: true, query: {
          from: "info.mobo.syncml.calendarevent:1",  //it's necessary that the comparison with _rev is at index 1 to update the rev value in complete.
          where: [ {prop: "accountId", op: "=", val: account.accountId}, { prop: "_rev", op: ">", val: rev || account.datastores.calendar.lastRev || 0 } ],
          incDel: true
        }}};
    } else if (activity.name === "info.mobo.syncml:" + account.name + ".watchContacts") {
      trigger = { method: "palm://com.palm.db/watch", key: "fired",
              params: { subscribe: true, query: {
          from: "info.mobo.syncml.contact:1", //it's necessary that the comparison with _rev is at index 1 to update the rev value in complete.
          where: [ {prop: "accountId", op: "=", val: account.accountId}, { prop: "_rev", op: ">", val: rev || account.datastores.contacts.lastRev || 0 } ],
          incDel: true
        }}};
    } else if (activity.name === "info.mobo.syncml:" + account.name + ".periodic") {
      restart = true;
    } else {
      restart = false;
    }
    return PalmCall.call("palm://com.palm.activitymanager/", "complete", { activityId: activity.activityId, trigger: trigger, restart: restart }).then(function (f) {
      log("activity restarted: " + JSON.stringify(f.result));
      f.result = { returnValue: true };
    });
  }
};

syncAssistant.prototype.complete = function () {
  var args = this.controller.args, activity, account;
	activity = args.$activity;
  if (activity) {
    account = SyncMLAccount.getAccountById(activity.accountId);
  } else {
    return;
  }
  log("============== Sync.complete");
  log("Activity was: " + JSON.stringify(activity));
  if (activity && activity.trigger && activity.trigger.returnValue === false) {
    log("Error with activity " + activity.name + ": " + JSON.stringify(activity.trigger));
    return;
  }
  this.retriggerActivities(activity, account);
  if (activity && activity.name && activity.name.indexOf(".delayed") > 0) {
    PalmCall.call("palm://com.palm.activitymanager/", "cancel", { activityId: activity.activityId }).then(function (f) {
      log("activity " + activity.name + " cancelled: " + JSON.stringify(f.result));
    });
  }
};
