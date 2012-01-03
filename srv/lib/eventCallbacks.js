//JSLint options:
/*global DB, log, iCal, account, setTimeout */ //PROBLEM: get rid of global account shomehow..
/*jslint indent: 2 */

var eventCallbacks = (function () {
  "use strict";
  var eventUpdated =  0,
    eventUpdateFailed = 0,
    eventAdded =  0,
    eventAddFailed = 0,
    eventDeleted = 0,
    eventDeleteFailed = 0,
    recurringEventIds = {};

  function getEventsFromDB(input) {
    try {
      log("Getting events: " + JSON.stringify(input.query));
      DB.find(input.query, false, false).then(
        function (future) {
          var r = future.result;
          if (r.returnValue === true) {
            input.result = r.results;
            input.success = true;
          } else {
            log("Error in getAllEvents: " + JSON.stringify(future.exception));
            input.success = false;
          }
          input.callback(input);
        }
      );
    } catch (exception) {
      log("Exception in getAllEvents: " + exception + " - " + JSON.stringify(exception));
      input.success = false;
      input.callback(input);
    }
  }

  function createEventArray(input) {
    //format event array for syncml and call callback: 
    var update = [], del = [], i, obj, result;
    if (input.success === true) {
      for (i = 0; i < input.result.length; i += 1) {
        try {
          result = input.result[i];
          //log("Got event: " + JSON.stringify(result));
          if (result._del === true) {
            obj = { localId: result._id, uid: result.uId};
            del.push(obj);
          } else {
            obj = { localId: result._id, data: iCal.generateICal(result), uid: result.uId};
            update.push(obj);
          }
        } catch (e) {
          log("Error while adding element " + i + " of " + input.result.length + ". Error: " + JSON.stringify(e));
          //TODO: unnotified error condition.
        }
      }
    }
    input.callback2({add: [], del: del, replace: update, success: input.success}); //still can't distinguish between new and changed items.
  }

  function createEvent(input) {
    log("createEvent called");
    try {
      var e, recId;
      if (input.event) {
        e = [input.event];
      } else {
        e = [iCal.parseICal(input.item)];
      }
      log("Event: " + e[0].subject);
      e[0].calendarId = account.webOsCalendarId; //need to set this to tell webOs in which calendar this event should be, undefined else. TODO: don't rely on global account object here. :(
      e[0].accountId = account.webOsAccountId;

      //try to find parentIds for children.
      if (e[0].recurringId || e[0].recurringId === 0) {
        recId = e[0].recurringId;
        recurringEventIds[recId] = { counter: 0};
        delete e[0].recurringId;
      }
      if (e[0].parentLocalId || e[0].parentLocalId === 0) {
        recId = e[0].parentLocalId;
        if (!recurringEventIds[recId] || !recurringEventIds[recId].id) {
          if (!recurringEventIds[recId]) {
            recurringEventIds[recId] = { counter: 0};
          }
          if (recurringEventIds[recId].counter < 30) {
            log("Got no parentId, yet. Wait a little if parent get's processed.");
            input.event = e[0];
            setTimeout(createEvent.bind(null, input), 100);
            return;
          } else {
            log("Waited long enough for parent... won't come. :(");
          }
        } else {
          log("Got parentId " + recurringEventIds[recId].id + " for " + e[0].subject);
          delete e[0].parentLocalId;
          e[0].parentId = recurringEventIds[recId].id;
        }
      }

      //continue adding of event.
      e[0]._kind = "info.mobo.syncml.calendarevent:1";
      //log("Got Event: " + JSON.stringify(e[0]));
      DB.put(e).then(
        function (future) {
          var r = future.result;
          if (r.returnValue === true) {
            eventAdded += 1;
            if (this.eventsAddedElement) {
              this.eventsAddedElement.innerHTML = eventAdded;
            }
            e[0]._id = r.results[0].id;
            input.localId = r.results[0].id;
            input.success = true;
            if (recId || recId === 0) {
              if (!recurringEventIds[recId]) {
                recurringEventIds[recId] = { counter: 0, id: e[0]._id };
              } else {
                recurringEventIds[recId].id = e[0]._id;
              }
            }
          } else {
            eventAddFailed += 1;
            if (this.eventsAddFailedElement) {
              this.eventsAddFailedElement.innerHTML = eventAddFailed;
            }
            try {
              log("Callback not successfull: " + JSON.stringify(future.exception.error) + ". at - " + input.item + " = " + JSON.stringify(e));
            } catch (exception) {
              log("Callback not successfull: " + JSON.stringify(future.exception));
            }
            input.success = false;
          }
          input.callback(input);
        }
      );
    } catch (exception) {
      log("Exception in createEvent: " + exception + " - " + input.item);
      log(JSON.stringify(exception));
      input.success = false;
      input.callback(input);
    }
  }

  function updateEvent(input) {
    log("Update event called");
    try {
      var e, recId;
      if (input.event) {
        e = [input.event];
      } else {
        e = [iCal.parseICal(input.item)];
      }
      log("Event: " + e[0].subject + " mit id: " + input.localId);
      e[0]._id = input.localId;
      e[0].calendarId = account.webOsCalendarId; //need to set this to tell webOs in which calendar this event should be, undefined else. TODO: don't rely on global account object here. :(
      e[0].accountId = account.webOsAccountId;

      //try to find parentIds for children. 
      if (e[0].recurringId) {
        recurringEventIds[e[0].recurringId] = e[0]._id; //have id already, just set it here. :)
        delete e[0].recurringId;
      }
      if (e[0].parentLocalId || e[0].parentLocalId === 0) {
        recId = e[0].parentLocalId;
        if (!recurringEventIds[recId] || !recurringEventIds[recId].id) {
          if (!recurringEventIds[recId]) {
            recurringEventIds[recId] = { counter: 0};
          }
          if (recurringEventIds[recId].counter < 30) {
            input.event = e[0];
            log("Got no parentId, yet. Wait a little if parent get's processed.");
            setTimeout(updateEvent.bind(null, input), 100);
            return;
          } else {
            log("Waited long enough for parent... won't come. :(");
          }
        } else {
          log("Got parentId " + recurringEventIds[recId].id + " for " + e[0].subject);
          delete e[0].parentLocalId;
          e[0].parentId = recurringEventIds[recId].id;
        }
      }

      //continue update.
      e[0]._kind = "info.mobo.syncml.calendarevent:1";
      DB.merge(e).then(
        function (future) {
          var r = future.result;
          if (r.returnValue === true) {
            eventUpdated += 1;
            log("Update: " + JSON.stringify(future.result));
            if (this.eventsUpdatedElement) {
              this.eventsUpdatedElement.innerHTML = eventUpdated;
            }
            input.success = true;
          } else {
            eventUpdateFailed += 1;
            if (this.eventsUpdateFailedElement) {
              this.eventsUpdateFailedElement.innerHTML = eventUpdateFailed;
            }
            log("Callback not successfull: " + future.exception.errorText + "(" + future.exception.errorCode + "). :(" + input.item + JSON.stringify(e));
            input.success = false;
          }
          input.callback(input);
        }
      );
    } catch (exception) {
      log("Exception in UpdateEvent: " + exception + " - " + JSON.stringify(exception) + " at " + input.item + " with ID " + input.localId);
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
		createEvent: createEvent,

		/**
		 * Updates an event. Parameters are the iCal item data string and the eventId.
		 * Called from c++.
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
				DB.del(ids, true).then(
				  function (future) {
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
				  }
				);
			} catch (exception) {
				log("Exception in DeleteEvent: " + exception + " - " + JSON.stringify(exception));
				input.success = false;
        input.callback(input);
			}
		},

		/**
		 * Deletes all events by a call to palm database service.
		 */
		deleteAllEvents: function (callback) {
		  log("DeleteAll events called.");
      try {
        //delete with purge=true.
        DB.del({from: "info.mobo.syncml.calendarevent:1" }, true).then(
          function (future) {
            var r = future.result;
            if (r.returnValue === true) {
              log("Successfully deleted all elements.");
              callback({success: true});
            } else {
              log("Error in deleteAllEvents: " + future.exception.errorText + "( " + future.exception.errorCode + ")");
              callback({success: false});
            }
          }
        );
			} catch (exception) {
				log("Exception in deleteAllEvents: " + exception + " - " + JSON.stringify(exception));
				//something went wrong, continue sync:
				callback({success: false});
			}
		},

		getNewEvents: function (callback) {
		  log("Get new events called.");
		  getEventsFromDB(
		    {
		      callback: createEventArray,
		      callback2: callback,
		      query: {
		        from: "info.mobo.syncml.calendarevent:1",
		        where: [ { prop: "_rev", op: ">", val: account.webOsCalendarRev } ],
		        incDel: true
		      }
		    }
		  );
		},

		getAllEvents: function (callback) {
		  log("Get all events called.");
		  getEventsFromDB({callback: createEventArray, callback2: callback, query: {from: "info.mobo.syncml.calendarevent:1"} }); //this query should just get all events.
		},

		checkCalendar: function () {
		  var query, calendar, obs;
			query = { from: "info.mobo.syncml.calendar:1", where: [ { prop: "accountId", op: "=", val: account.webOsAccountId } ] };

			log("Check calendar.");
			if (account.syncCalendar) {
				if (account.webOsCalendarId !== undefined) {
					log("Have Calendar Id: " + account.webOsCalendarId);
					DB.find(query, false, false).then(
					  function (future) {
					    var result = future.result, results, i;
					    if (result.returnValue === true) {
					      results = result.results;
					      for (i = 0; i < results.length; i += 1) {
					        if (results[i]._id === account.webOsCalendarId) {
					          log("Found calendar, everything ok.. :)");
					          return;
					        }
					      }
					      //if we reached this point, calendar was not found..
					      log("Calendar not found.. :(");
					      account.webOsCalendarId = undefined;
					      this.checkCalendar();
					    }
					  }
					);
				} else {
					log("Need to create calendar account.");

					calendar = {
						"_kind": "info.mobo.syncml.calendar:1",
						"accountId": account.webOsAccountId,
						"color": "purple",
						"excludeFromAll": false,
						"isReadOnly": false,
						"name": account.name + " Calendar",
						"syncSource": "info.mobo.syncml"
					};
					obs = [calendar];

					DB.put(obs).then(
					  function (future) {
					    if (future.result.returnValue === true) {
					      log("Created calendar: " + JSON.stringify(future.result.results));
					      if (future.result.results.length > 0) {
					        account.webOsCalendarId = future.result.results[0].id;
					        account.saveConfig();
					      } else {
					        log("Error: Add returned no ID??");
					      }
					    } else {
					      log("Could not add calendar: " + future.result.errorCode + " = " + future.result.errorMessage);
					    }
					  }
					);
				}
			}
		},

		startTrackingChanges: function () {
		  log("startTrackingChanges called.");
			try {
				log("Tracking changes for future updates.");
				DB.find({from: "info.mobo.syncml.calendarevent:1", select: ["_rev"]}).then(
				  function (future) {
				    var r = future.result, i;
				    if (r.returnValue === true) {
		          for (i = 0; i < r.results.length; i += 1) {
		            if (r.results[i]._rev > account.webOsCalendarRev) {
		              account.webOsCalendarRev = r.results[i]._rev;
		            }
		          }
		          log("Will sync all changes after rev " + account.webOsCalendarRev);
				    } else {
				      log("Error in startTrackingchanges: " + future.exception.errorText + "( " + future.exception.errorCode + ") = " + JSON.stringify(future.exception));
				    }
				  }
				);
			} catch (exception) {
				log("Exception in startTrackingChanges: " + exception + " - " + JSON.stringify(exception));
			}
		},

		finishSync: function (successful) {
			try {
				if (successful) {
					this.startTrackingChanges();
				}

				eventUpdated = 0;
				eventUpdateFailed = 0;
				eventAdded = 0;
				eventAddFailed = 0;
				eventDeleted = 0;
				eventDeleteFailed = 0;
			} catch (exception) {
				log("Exception in finishSync: " + exception + " - " + JSON.stringify(exception));
			}
		}
	}; //end of public interface
}()); //selfinvoke function

