//JSLint options:
/*global DB, log, iCal, SyncMLAccount, logError_lib, Future, logToApp, commonCallbacks, moboCopy */
/*jslint  nomen: true */
"use strict";

var eventCallbacks = (function () {
  var stats = 
    { 
      deleteOK: 0, 
      delteFailed: 0,
      updateOK: 0,
      updateFailed: 0,
      addOK: 0,
      addFailed: 0
    },
    recurringEventIds = {}; //saves child: event, parentId: parentId.
    
  function updateEvent(input) {
    log("Update event called");
    var doUpdate = function (input, event) {
      try {
        event._onServer = true; //event came from server.
        var e = [event], recId, childId;
        log("Event: " + e[0].subject + " with id: " + input.localId);
        e[0]._id = input.localId;
        e[0].calendarId = input.account.datastores.calendar.dbId; //need to set this to tell webOs in which calendar this event should be, undefined else. TODO: don't rely on global account object here. :(
        e[0].accountId = input.account.accountId;

        //try to find parentIds for children. 
        if (e[0].recurringId) {
          recId = e[0].recurringId;
          if (!recurringEventIds[recId]) {
            recurringEventIds[recId] = {childs: []};
          }
          log("recurring event. id: " + recId);
          if (e[0]._id) {
            recurringEventIds[recId].id = e[0]._id; //have id already, just set it here. :)
            delete e[0].recurringId;
            recId = undefined;
          }
        }
        if (e[0].parentLocalId || e[0].parentLocalId === 0) {
          recId = e[0].parentLocalId;
          if (!recurringEventIds[recId]) {
            recurringEventIds[recId] = {childs: []};
          }
          log("Is exception for " + recId);
          if (recurringEventIds[recId].id) { //if we have parentId all is fine, go on. 
            log("Got parentId " + recurringEventIds[recId] + " for " + e[0].subject);
            delete e[0].parentLocalId;
            e[0].parentId = recurringEventIds[recId];
          } else {
            childId = recurringEventIds[recId].childs.length;
            recurringEventIds[recId].childs.push(e[0]);
          }
        }

        //continue update.
        e[0]._kind = "info.mobo.syncml.calendarevent:1";
        DB.merge(e).then(moboCopy({ recurringId: recId, id: e[0]._id, child: childId }), //try to prevent others from overwriting data for this object. :(
          function (future) {
            try {
              var r = future.result;
              if (r.returnValue === true) {
                if (!this.id) {
                  stats.addOK += 1;
                  if (this.recurringId >= 0) {
                    if (this.childId >= 0) {
                      recurringEventIds[this.recurringId].childs[this.childId]._id = r.results[0].id;
                    } else {
                      recurringEventIds[this.recurringId] = r.results[0].id;
                    }
                    log("Was recurring event with " + this.recurringId + ". Saved id: " + r.results[0].id);
                  }
                } else {
                  stats.updateOK += 1;
                }
                input.localId = r.results[0].id;
                input.success = true;
                
                if (r.results[0].rev > input.account.datastores.calendar.lastRev) {
                  input.account.datastores.calendar.lastRev = r.results[0].rev;
                }
              } else {
                if (this.id) {
                  stats.addFailed += 1;
                } else {
                  stats.updateFailed += 1;
                }
                log("Callback not successfull: " + future.exception.errorText + "(" + future.exception.errorCode + "). :(" + input.item + JSON.stringify(this.id));
                input.success = false;
              }
              if (input.callback) {
                input.callback(input);
              }
            } catch (e) {
              logError_lib(e);
            }
          }
          );
      } catch (exception) {
        log("Exception in UpdateEvent(doUpdate): " + exception + " - " + JSON.stringify(exception) + " at " + input.item + " with ID " + input.localId);
        input.success = false;
        if (input.callback) {
          input.callback(input);
        }
        logError_lib(exception);
      }
    };

    //convert event:
    try {
      if (input.event) {
        doUpdate(input, input.event); //short cut.
      } else {
        log("Calling callback");
        iCal.parseICal(input.item, input.serverData, doUpdate.bind(this, input)); //remember input.
      }
    } catch (e) {
      log("Error in updateEvent(main): ");
      log(JSON.stringify(e));
      input.success = false;
      if (input.callback) {
        input.callback(input);
      }
      logError_lib(e);
    }
  }
  
  function createEventArray(input) {
    //format event array for syncml and call callback: 
    var update = [], del = [], add = [], i, obj, result, callback, updates = 0;
    callback = function (ical) {
      try {
        //log(JSON.stringify(this));
        this.data = ical;
        if (this.noAdd === true) {
          log("Item was on server already, adding to update list: " + JSON.stringify(this.noAdd));
          update.push(this);
        } else {
          log("Item was not on server yet, adding to add list");
          if (this.event) {
            log("Saving that this will be added to server.");
            this.addOK -= 1; //be optimistic here.
            updateEvent(this); //save that we added the event to the server.. this is not 100% correct here, sync may still fail.. but that should trigger a slow sync anyway, shouldn't it?
          }
          add.push(this);
        }
        updates -= 1;
        log("Remaining items: " + updates);
        if (updates === 0) {
          input.callback2({add: add, del: del, replace: update, success: input.success}); //still can't distinguish between new and changed items.
        }
      } catch (e) {
        log("Error in createEventArray(callback): ");
        log(JSON.stringify(e));
        input.success = false;
        input.callback(input);
        logError_lib(e);
      }
    };
    try {
      if (input.success === true) {
        for (i = 0; i < input.result.length; i += 1) {
          try {
            result = input.result[i];
            //update rev's on the fly for all really processed data.
            if (result._rev > input.account.datastores.calendar.lastRev) {
              input.account.datastores.calendar.lastRev = result._rev;
            }
            
            //log("Got event: " + JSON.stringify(result));
            if (result._del === true) {
              obj = { localId: result._id, uid: result.uId};
              del.push(obj);
            } else {
              obj = { localId: result._id, uid: result.uId, noAdd: result._onServer, event: result, account: input.account};
              updates += 1;
              setTimeout(iCal.generateICal.bind(iCal, result, input.serverData, callback.bind(obj)), 100);
            }
          } catch (e) {
            log("Error while adding element " + i + " of " + input.result.length + ". Error: " + JSON.stringify(e));
            logError_lib(e);
          }
        }
        delete input.result; //try to free some memory.
      }
      if (updates === 0) {//had no iCal conversions.
        input.callback2({add: add, del: del, replace: update, success: input.success}); //still can't distinguish between new and changed items.
      }
    } catch (error) {
      log("Error in createEventArray(main): ");
      log(JSON.stringify(error));
      input.success = false;
      input.callback(input);
      logError_lib(error);
    }
  }

  //will return public interface:
	return {
		/**
		 * @param {Object} event
		 */
		createEvent: function (input) {
	    //log("createEvent called, be mean and call updateEvent. Without id set result will be the same anyway.");
	    updateEvent(input);
	  },

		/**
		 * Updates an event. Parameters are the iCal item data string and the eventId.
		 * @param {Object} event
		 * @param {Object} eventId
		 */
		updateEvent: updateEvent,

		/**
		 * Deletes event with eventId. Called from c++.
		 * @param {Object} eventid
		 */
    deleteEvent: function (input) {
      input.datastore = input.account.datastores.calendar;
      input.stats = stats;
      commonCallbacks.deleteItem(input);
		},

		/**
		 * Deletes all events by a call to palm database service.
		 */
		deleteAllEvents: function (input) {
      input.kind = "info.mobo.syncml.calendarevent:1";
      commonCallbacks.deleteAllItems(input);
		},

		getNewEvents: function (input) {
		  log("Get new events called.");
		  commonCallbacks.getItemsFromDB(
		    {
		      callback: createEventArray,
		      callback2: input.callback,
		      serverData: input.serverData,
		      query: {
		        from: "info.mobo.syncml.calendarevent:1",
		        where: [ { prop: "_rev", op: ">", val: input.account.datastores.calendar.lastRev }, {prop: "accountId", op: "=", val: input.account.accountId} ],
		        incDel: true
		      },
          datastore: input.account.datastores.calendar,
          account: input.account
		    }
		  );
		},

		getAllEvents: function (input) {
		  log("Get all events called.");
		  commonCallbacks.getItemsFromDB(
        {
          callback: createEventArray, 
          callback2: input.callback, 
          serverData: input.serverData, 
          query: 
            {
              from: "info.mobo.syncml.calendarevent:1",
              where: [ { prop: "accountId", op: "=", val: input.account.accountId } ]
            }, 
          datastore: input.account.datastores.calendar,
          account: input.account
        }
      ); //this query should just get all events.
		},

		checkCalendar: function (account) {
		  var query, calendar, obs, resfuture = new Future();
			query = { from: "info.mobo.syncml.calendar:1", where: [ { prop: "accountId", op: "=", val: account.accountId } ] };

			//log("Check calendar.");
			if (!account && !account.accountId) {
			  //log("Did not get account! => failure.");
			  resfuture.result = { returnValue: false };
			} else if (account.datastores.calendar && account.datastores.calendar.enabled) {
        //log("Have Calendar Id: " + account.datastores.calendar.dbId);
        DB.find(query, false, false).then(
          function (future) {
            var result = future.result, results, i, calPresent = false;
            if (result.returnValue === true) {
              results = result.results;
              for (i = 0; i < results.length; i += 1) {
                if (results[i]._id === account.datastores.calendar.dbId) {
                  log("Found calendar, everything ok.. :)");
                  resfuture.result = {returnValue: true};
                  calPresent = true;
                }
              }
              if (!calPresent && results.length > 0) {
                account.datastores.calendar.dbId = results[0]._id;
                calPresent = true;
                resfuture.result = {returnValue: true};
                log("Calendar was not associated with our account object...? Repaired that.");
              }
            }

            if (!calPresent) {
              //no calendar => create one.
              account.datastores.calendar.dbId = undefined;
              calendar = {
                "_kind": "info.mobo.syncml.calendar:1",
                "accountId": account.accountId,
                "color": "purple",
                "excludeFromAll": false,
                "isReadOnly": false,
                "name": (account.name || "SyncML") + " Calendar",
                "syncSource": "info.mobo.syncml"
              };
              obs = [calendar];

              DB.put(obs).then(
                function (f1) {
                  if (f1.result.returnValue === true) {
                    log("Created calendar: " + JSON.stringify(f1.result.results));
                    if (f1.result.results.length > 0) {
                      account.datastores.calendar.dbId = f1.result.results[0].id;
                      SyncMLAccount.setAccount(account);
                      SyncMLAccount.saveConfig();
                      resfuture.result = {returnValue: true};
                    } else {
                      log("Error: Add returned no ID??");
                      resfuture.result = {returnValue: false};
                    }
                  } else {
                    log("Could not add calendar: " + f1.result.errorCode + " = " + f1.result.errorMessage);
                    resfuture.result = {returnValue: false};
                  }
                }
              );
            }
          }
        );
      } else { //calendar disabled => don't create, all is fine.
        resfuture.result = { returnValue: true };
      }
			return resfuture;
		},

		getLatestRev: function (account) {
      commonCallbacks.getLatestRev(account, "info.mobo.syncml.calendarevent:1");
		},

		finishSync: function (account, outerFuture) {
			var field = "", recEv, updates = 0, innerFuture = new Future(), updateReturn, finishFinished, updateParentId, res;
		  try {
		    updateReturn = function () {
		      updates -= 1;
		      if (updates === 0) {
		        //all updates finished.
		        var res = innerFuture.result;
	          if (!res) {
	            res = {};
	          }
		        res.updates = true;
		        innerFuture.result = res;
		      }
		    };

		    finishFinished = function (f) {
		      log("check if event cleanup finished.");
		      if (f.result.updates) {
            commonCallbacks.finishSync(account.datastores.calendar, stats);

		        var res = outerFuture.result;
		        if (!res) {
		          res = {};
		        }
		        res.calendar = true;
		        outerFuture.result = res;
		        log("event cleanup finished.");
		      } else {
		        log("event cleanup not finished yet: " + JSON.stringify(f.result));
		        f.then(finishFinished);
		      }
		    };

		    updateParentId = function (events, id) {
		      var i;
		      try {
		        if (!events) {
		          log("Got no events...??");
		          return;
		        }
            if (!id || !id.result || id.result.length === 0) {
              log("Got no ids, can't set parentIds. Most probably we don't have that event, or something went wrong during parsing...");
              return;
            }
            if (id.result.length > 1) {
              log("Got " + id.result.length + " ids. Can't work with that... will take first id only.");
            }
            for (i = 0; i < events.length; i += 1) {
              events[i].parentId = id.result[0]._id;
              if (events[i]._id) { //prevent duplicate events here
                updates += 1;
                updateEvent({ event: events[i], callback: updateReturn.bind(this), account: account });
              } else {
                log("Event somehow had no id set... can't update. :(");
              }
            }
		      } catch (e) {
            log("Error in updateParentId: ");
            log(JSON.stringify(e));
            logError_lib(e);
          }
		    };

			  for (field in recurringEventIds) {
			    if (recurringEventIds.hasOwnProperty(field)) {
	          recEv = recurringEventIds[field];
			      log("Processing recurring Event: " + field + " with parentId " + recEv.id + " and childs " + (recEv.childs ? recEv.childs.length : undefined));
			      if (!recEv.id) {
			        //TODO: search parent...
			        log("Parent not processed... can't update parentId. Search in DB not implemented, yet. :(");
			      } else {
			        updateParentId(recEv.childs, { result: [{"_id": recEv.id}]}); //construct same structure as event search would do, to ease processing.
			      }
			    }
			  }
			  if (updates === 0) {
          res = innerFuture.result;
          if (!res) {
            res = {};
          }
          res.updates = true;
          innerFuture.result = res;
			  }

        innerFuture.then(finishFinished);
			} catch (exception) {
				logError_lib(exception);
			}
		}
	}; //end of public interface
}()); //selfinvoke function

