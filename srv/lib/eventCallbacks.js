//JSLint options:
/*global DB, log, iCal, SyncMLAccount */
"use strict";

var eventCallbacks = (function () {
  var ids = {}, //should set accountId, calendarId and contactsId before use.
    revs = { calendar: 0 }, //should be set before use.
    eventUpdated =  0,
    eventUpdateFailed = 0,
    eventAdded =  0,
    eventAddFailed = 0,
    eventDeleted = 0,
    eventDeleteFailed = 0,
    recurringEventIds = {}; //saves child: event, parentId: parentId.

  function getEventsFromDB(input) {
    try {
      log("Getting events: " + JSON.stringify(input.query));
      var future_ = DB.find(input.query, false, false);
      future_.then(
        function (future) {
          try {
            var r = future.result;
            if (r.returnValue === true) {
              input.result = r.results;
              log("Got " + r.results.length + " events to send to server.");
              input.success = true;
            } else {
              log("Error in getAllEvents: " + JSON.stringify(future.exception));
              input.success = false;
            }
            input.callback(input);
          } catch (e) {
            log("Error in getEventsFromDB(Future): ");
            log(JSON.stringify(e));
            input.success = false;
            input.callback(input);
          }
        }
      );
      future_.onError(function (f) {
        log("Error in getEventsFromDB future: " + f.exeption);
        logToApp("Could not get events from DB: " + JSON.stringify(f.exeption));
        future_.result = { returnValue: false };
        input.success = false;
        input.callback(input);
      });
    } catch (exception) {
      log("Error in getEventsFromDB(Future): ");
      log(JSON.stringify(exception));
      input.success = false;
      input.callback(input);
    }
  }

  function createEventArray(input) {
    //format event array for syncml and call callback: 
    var update = [], del = [], i, obj, result, callback, updates = 0;
    callback = function (ical) {
      try {
        log(JSON.stringify(this));
        this.data = ical;
        update.push(this);
        updates -= 1;
        log("Remaining updates: " + updates);
        if (updates === 0) {
          input.callback2({add: [], del: del, replace: update, success: input.success}); //still can't distinguish between new and changed items.
        }
      } catch (e) {
        log("Error in createEventArray(callback): ");
        log(JSON.stringify(e));
        input.success = false;
        input.callback(input);
      }
    };
    try {
      if (input.success === true) {
        for (i = 0; i < input.result.length; i += 1) {
          try {
            result = input.result[i];
            //log("Got event: " + JSON.stringify(result));
            if (result._del === true) {
              obj = { localId: result._id, uid: result.uId};
              del.push(obj);
            } else {
              obj = { localId: result._id, uid: result.uId};
              updates += 1;
              setTimeout(iCal.generateICal.bind(iCal, result, input.serverData, callback.bind(obj)), 100);
            }
          } catch (e) {
            log("Error while adding element " + i + " of " + input.result.length + ". Error: " + JSON.stringify(e));
            //TODO: unnotified error condition.
          }
        }
      }
      if (updates === 0) {//had no iCal conversions.
        input.callback2({add: [], del: del, replace: update, success: input.success}); //still can't distinguish between new and changed items.
      }
    } catch (error) {
      log("Error in getEventsFromDB(Future): ");
      log(JSON.stringify(error));
      input.success = false;
      input.callback(input);
    }
  }

  function clone(obj) {
    var newObj = {};
    newObj.id = obj.id;
    newObj.recurringId = obj.recurringId;
    newObj.child = obj.child;
    return newObj;
  }

  function updateEvent(input) {
    log("Update event called");
    var doUpdate = function (input, event) {
      try {
        var e = [event], recId = undefined, childId = undefined;
        log("Event: " + e[0].subject + " with id: " + input.localId);
        e[0]._id = input.localId;
        e[0].calendarId = ids.calendarId; //need to set this to tell webOs in which calendar this event should be, undefined else. TODO: don't rely on global account object here. :(
        e[0].accountId = ids.accountId;
  
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
        var future_ = DB.merge(e);
        future_.then(clone({ recurringId: recId, id: e[0]._id, child: childId }), //try to prevent others from overwriting data for this object. :(
          function (future) {
            try {
              var r = future.result;
              if (r.returnValue === true) {
                if (!this.id) {
                  eventAdded += 1;
                  if (this.eventsAddedElement) {
                    this.eventsAddedElement.innerHTML = eventAdded;
                  }
                  if (this.recurringId >= 0) {
                    if (this.childId >= 0) {
                      recurringEventIds[this.recurringId].childs[this.childId]._id = r.results[0].id;
                    } else {
                      recurringEventIds[this.recurringId] = r.results[0].id;
                    }
                    log("Was recurring event with " + this.recurringId + ". Saved id: " + r.results[0].id);
                  }
                } else {
                  eventUpdated += 1;
                  if (this.eventsUpdatedElement) {
                    this.eventsUpdatedElement.innerHTML = eventUpdated;
                  }
                }
                input.localId = r.results[0].id;
                input.success = true;
              } else {
                if (this.id) {
                  eventAddFailed += 1;
                  if (this.eventsAddFailedElement) {
                    this.eventsAddFailedElement.innerHTML = eventAddFailed;
                  }
                } else {
                  eventUpdateFailed += 1;
                  if (this.eventsUpdateFailedElement) {
                    this.eventsUpdateFailedElement.innerHTML = eventUpdateFailed;
                  }
                }
                log("Callback not successfull: " + future.exception.errorText + "(" + future.exception.errorCode + "). :(" + input.item + JSON.stringify(this.id));
                input.success = false;
              }
              if (input.callback) {
                input.callback(input);
              }
            } catch (e) {
              log("Error in updateEvent(Future): ");
              log(JSON.stringify(e));
              input.success = false;
              input.callback(input);
            }
          });
        future_.onError(function (f) {
          log("Error in updateEvent-future: " + f.exeption);
          logToApp("Could not update Event: " + JSON.stringify(f.exeption));
          future_.result = { returnValue: false };
          input.success = false;
          input.callback(input);
        });
      } catch (exception) {
        log("Exception in UpdateEvent(doUpdate): " + exception + " - " + JSON.stringify(exception) + " at " + input.item + " with ID " + input.localId);
        input.success = false;
        if (input.callback) {
          input.callback(input);
        }
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
      input.callback(input);
    }
  }

  //will return public interface:
	return {
		/**
		 * Creates event, called from c++ part. Parameter is the iCal item data string.
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
		 * Deteles event with eventId. Called from c++.
		 * @param {Object} eventid
		 */
		deleteEvent: function (input) {
		  log("Delete event called with id: " + input.localId);
			try {
				var ids = [input.localId];
				//delete with purge=true.
				var future_ = DB.del(ids, true);
				future_.then(
				  function (future) {
				    try {
  				    var r = future.result;
  				    if (r.returnValue === true) {
                eventDeleted += 1;
                if (this.eventsDeletedElement) {
                  this.eventsDeletedElement.innerHTML = eventDeleted;
                }
                input.success = true;
  				    } else {
  				      eventDeleteFailed += 1;
  				      if (this.eventsDeleteFailedElement) {
  				        this.eventsDeleteFailedElement.innerHTML = eventDeleteFailed;
  				      }
  				      log("Callback not successfull: " + future.exception.errorText + "(" + future.exception.errorCode + " for eventId: " + input.localId + "). :(");
  				      input.success = false;
  				    }
  				    input.callback(input);
				    } catch (e) {
	            log("Error in deleteEvent(Future): ");
	            log(JSON.stringify(e));
	            input.success = false;
	            input.callback(input);
	          }
				  }
				);
				future_.onError(function (f) {
          log("Error in delEvent-future: " + f.exeption);
          logToApp("Could not delete Event: " + JSON.stringify(f.exeption));
          future_.result = { returnValue: false };
          input.success = false;
          input.callback(input);
        });
			} catch (exception) {
				log("Exception in DeleteEvent: " + exception + " - " + JSON.stringify(exception));
				input.success = false;
        input.callback(input);
			}
		},

		/**
		 * Deletes all events by a call to palm database service.
		 */
		deleteAllEvents: function (input) {
		  log("DeleteAll events called.");
      try {
        //delete with purge=true.
        var future_ = DB.del({from: "info.mobo.syncml.calendarevent:1", where: [{prop: "accountId", op: "=", val: ids.accountId}] }, true);
        future_.then(
          function (future) {
            var r = future.result;
            if (r.returnValue === true) {
              log("Successfully deleted all elements.");
              input.callback({success: true});
            } else {
              log("Error in deleteAllEvents: " + future.exception.errorText + "( " + future.exception.errorCode + ")");
              input.callback({success: false});
            }
          }
        );
        future_.onError(function (f) {
          log("Error in deleteAllEvents-future: " + f.exeption);
          logToApp("Could not delete all Events: " + JSON.stringify(f.exeption));
          future_.result = { returnValue: false };
          input.callback({success: false});
        });
			} catch (exception) {
				log("Exception in deleteAllEvents: " + exception + " - " + JSON.stringify(exception));
				//something went wrong, continue sync:
				input.callback({success: false});
			}
		},

		getNewEvents: function (input) {
		  log("Get new events called.");
		  getEventsFromDB(
		    {
		      callback: createEventArray,
		      callback2: input.callback,
		      serverData: input.serverData,
		      query: {
		        from: "info.mobo.syncml.calendarevent:1",
		        where: [ { prop: "_rev", op: ">", val: revs.calendar }, {prop: "accountId", op: "=", val: ids.accountId} ],
		        incDel: true
		      }
		    }
		  );
		},

		getAllEvents: function (input) {
		  log("Get all events called.");
		  getEventsFromDB({callback: createEventArray, callback2: input.callback, serverData: input.serverData, query: {from: "info.mobo.syncml.calendarevent:1", 
		    where: [{prop: "accountId", op: "=", val: ids.accountId}]} }); //this query should just get all events.
		},

		checkCalendar: function (account) {
		  var query, calendar, obs, resfuture = new Future({returnValue: false});
			query = { from: "info.mobo.syncml.calendar:1", where: [ { prop: "accountId", op: "=", val: account.accountId } ] };

			//log("Check calendar.");
			if (!account && !account.accountId) {
			  //log("Did not get account! => failure.");
			  return resfuture;
			}
			if (account.datastores.calendar) {
				if (account.datastores.calendar.dbId !== undefined) {
					//log("Have Calendar Id: " + account.datastores.calendar.dbId);
				  resfuture = DB.find(query, false, false).then(
					  function (future) {
					    var result = future.result, results, i;
					    if (result.returnValue === true) {
					      results = result.results;
					      for (i = 0; i < results.length; i += 1) {
					        if (results[i]._id === account.datastores.calendar.dbId) {
					          log("Found calendar, everything ok.. :)");
					          future.result = {returnValue: true};
					          return;
					        }
					      }
					      //if we reached this point, calendar was not found..
					      //log("Calendar not found.. :(");
					      account.datastores.calendar.dbId = undefined;
					      eventCallbacks.checkCalendar(account).then(function (f) {
					        //transfer result to outer future.
					        resfuture.result = f.result;
					      });
					    }
					  }
					);
				  resfuture.onError(function (f) {
	          log("Error in checkCalendar-future: " + f.exeption);
	          logToApp("Could not find Calendar: " + JSON.stringify(f.exeption));
	          resfuture.result = { returnValue: false };
	        });
				} else {
					//log("Need to create calendar account.");

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

					resfuture = DB.put(obs).then(
					  function (future) {
					    if (future.result.returnValue === true) {
					      log("Created calendar: " + JSON.stringify(future.result.results));
					      if (future.result.results.length > 0) {
					        account.datastores.calendar.dbId = future.result.results[0].id;
					        SyncMLAccount.setAccount(account);
					        SyncMLAccount.saveConfig();
					        future.result = {returnValue: true};
					      } else {
					        log("Error: Add returned no ID??");
					        future.result = {returnValue: false};
					      }
					    } else {
					      log("Could not add calendar: " + future.result.errorCode + " = " + future.result.errorMessage);
					      future.result = {returnValue: false};
					    }
					  }
					);
					future_.onError(function (f) {
	          log("Error in checkCalendar-future: " + f.exeption);
	          logToApp("Could not create Calendar: " + JSON.stringify(f.exeption));
	          resfuture.result = { returnValue: false };
	        });
				}
			}
			
			return resfuture;
		},

		startTrackingChanges: function (account, outerFuture) {
		  log("startTrackingChanges called.");
			try {
				log("Tracking changes for future updates.");
				var future_ = DB.find({from: "info.mobo.syncml.calendarevent:1", 
				                       where: [{prop: "accountId", op: "=", val: ids.accountId}], 
				                       select: ["_rev"], incDel: true});
				future_.then(
				  function (future) {
				    var r = future.result, i;
				    if (r.returnValue === true) {
				      revs.calendar = 0; //this is necessary in case we got some to high rev from palm backup or whatever. 
		          for (i = 0; i < r.results.length; i += 1) {
		            if (r.results[i]._rev > revs.calendar) {
		              revs.calendar = r.results[i]._rev;
		            }
		          }
		          if (account && account.datastores && account.datastores.calendar) {
		            account.datastores.calendar.lastRev = revs.calendar;
		            SyncMLAccount.setAccount(account);
	              log("Will sync all changes after rev " + revs.calendar);
		          } else {
		            log("Could not save new rev in account object... wrong parameters applied?");
		          }
		          var res = outerFuture.result;
		          if (!res) {
		            res = {};
		          }
		          res.rev = true;
		          outerFuture.result = res;
				    } else {
				      log("Error in startTrackingchanges: " + future.exception.errorText + "( " + future.exception.errorCode + ") = " + JSON.stringify(future.exception));
				    }
				  }
				);
				future_.onError(function (f) {
          log("Error in startTrackingChanges-future: " + f.exeption);
          logToApp("Could not clean up event changes: " + JSON.stringify(f.exeption));
          future_.result = { returnValue: false };
        });
			} catch (exception) {
				log("Exception in startTrackingChanges: " + exception + " - " + JSON.stringify(exception));
        var res = outerFuture.result;
        if (!res) {
          res = {};
        }
        res.rev = true;
        outerFuture.result = res;
			}
		},

		finishSync: function (account, outerFuture) {
			var field = "", recEv, updates = 0, innerFuture = new Future();
		  try {
		    var updateReturn = function () {
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

		    var finishFinished = function (f) {
		      log("check if event cleanup finished.");
		      if (f.result.updates && f.result.rev) {
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
		     
		    var updateParentId = function(events, id) {
		      var i;
		      try {
  		      if (!id || !id.result || id.result.length === 0) {
  		        log("Got no ids, can't set parentIds. Most probably we don't have that event, or something went wrong during parsing...");
  		      } else if (id.result.length > 1) {
  		        log("Got " + id.result.length + " ids. Can't work with that... will take first id only.");
  		      }
  		      for (i = 0; i < events.length; i += 1) {
  		        events[i].parentId = id.result[0]._id;
  		        if (events[i]._id) { //prevent duplicate events here
  		          updates += 1;
  	            updateEvent({ event: events[i], callback: updateReturn.bind(this) });
  		        } else {
  		          log("Event somehow had no id set... can't update. :(");
  		        }
  		      }
		      } catch (e) {
            log("Error in updateParentId: ");
            log(JSON.stringify(e));
          }
		    };

			  for (field in recurringEventIds) {
			    if (recurringEventIds.hasOwnProperty(field)) {
	          recEv = recurringEventIds[field]; 
			      log("Processing recurring Event: " + field + " with parentId " + recEv.id + " and childs " + recEv.childs.length);
			      if (!recEv.id) {
			        //TODO: search parent...
			        log("Parent not processed... can't update parentId. Search in DB not implemented, yet. :(");
			      } else {
			        updateParentId(recEv.childs, { result: [{"_id": recEv.id}]}); //construct same structure as event search would do, to ease processing.
			      }
			    }
			  }
			  if (updates === 0) {
          var res = innerFuture.result;
          if (!res) {
            res = {};
          }
          res.updates = true;
          innerFuture.result = res;
			  }
  			eventCallbacks.startTrackingChanges(account, innerFuture);

  			innerFuture.then(finishFinished);
  			
        log("Did " + eventAdded + " adds, " + eventAddFailed + " adds failed.");
        log("Did " + eventUpdated + " updates, " + eventUpdateFailed + " updates failed.");
        log("Did " + eventDeleted + " deletes, " + eventDeleteFailed + " deletes failed.");
        log("Did " + account.datastores.calendar.addOwn + " adds on server");
        log("Did " + account.datastores.calendar.replaceOwn + " updates on server");
        log("Did " + account.datastores.calendar.delOwn + " deletes on server");
        account.datastores.calendar.addFromServer = eventAdded;
        account.datastores.calendar.addFromServerFail = eventAddFailed;
        account.datastores.calendar.updateFromServer = eventUpdated;
        account.datastores.calendar.updateFromServerFail = eventUpdateFailed;
        account.datastores.calendar.deleteFromServer = eventDeleted;
        account.datastores.calendar.deleteFromServerFail = eventDeleteFailed;
				eventUpdated = 0;
				eventUpdateFailed = 0;
				eventAdded = 0;
				eventAddFailed = 0;
				eventDeleted = 0;
				eventDeleteFailed = 0;
			} catch (exception) {
				log("Exception in finishSync: " + exception + " - " + JSON.stringify(exception));
			}
		},

		//set {accountId: , calendarId: , contactsId:}
		setAccountAndDatastoreIds: function (accountIds) {
		  ids = accountIds;
		},

		//set { calendar: rev, contacts: rev, .... }
		setRevisions: function (revisions) {
		  log("Got revisions: " + JSON.stringify(revisions));
		  revs = revisions;
		}
	}; //end of public interface
}()); //selfinvoke function

