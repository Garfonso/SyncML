//JSLint options:
/*global DB, log, iCal, setTimeout, SyncMLAccount, vCard */
"use strict";

var itemCallbacks = (function () {
  var ids = {}, //should set accountId, calendarId and contactsId before use.
    revs = { calendar: 0 }, //should be set before use.
    itemUpdated =  0,
    itemUpdateFailed = 0,
    itemAdded =  0,
    itemAddFailed = 0,
    itemDeleted = 0,
    itemDeleteFailed = 0,
    recurringEventIds = {}; //saves child: event, parentId: parentId.

  function getItemsFromDB(input) {
    try {
      log("Getting items: " + JSON.stringify(input.query));
      DB.find(input.query, false, false).then(
        function (future) {
          var r = future.result;
          if (r.returnValue === true) {
            input.result = r.results;
            log("Got " + r.results.length + " items to send to server.");
            input.success = true;
          } else {
            log("Error in getItemsFromDB: " + JSON.stringify(future.exception));
            input.success = false;
          }
          input.callback(input);
        }
      );
    } catch (exception) {
      log("Exception in getItemsFromDB: " + exception + " - " + JSON.stringify(exception));
      input.success = false;
      input.callback(input);
    }
  }

  function createItemArray(transform, input) {
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
            obj = { localId: result._id, data: transform(result), uid: result.uId};
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

  function clone(obj) {
    var newObj = {};
    newObj.id = obj.id;
    newObj.recurringId = obj.recurringId;
    newObj.child = obj.child;
    return newObj;
  }

  function replaceItems(input) {
    log("replaceItems called");
    try {
      var e, recId = undefined, childId = undefined;
      if (input.event) {
        e = [input.event];
      } else {
        e = [iCal.parseICal(input.item)];
      }
      log("Item: " + e[0].subject + " with id: " + input.localId);
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
      DB.merge(e).then(clone({ recurringId: recId, id: e[0]._id, child: childId }), //try to prevent others from overwriting data for this object. :(
        function (future) {
          var r = future.result;
          if (r.returnValue === true) {
            if (!this.id) {
              itemAdded += 1;
              if (this.eventsAddedElement) {
                this.eventsAddedElement.innerHTML = itemAdded;
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
              itemUpdated += 1;
              if (this.eventsUpdatedElement) {
                this.eventsUpdatedElement.innerHTML = itemUpdated;
              }
            }
            input.localId = r.results[0].id;
            input.success = true;
          } else {
            if (this.id) {
              itemAddFailed += 1;
              if (this.eventsAddFailedElement) {
                this.eventsAddFailedElement.innerHTML = itemAddFailed;
              }
            } else {
              itemUpdateFailed += 1;
              if (this.eventsUpdateFailedElement) {
                this.eventsUpdateFailedElement.innerHTML = itemUpdateFailed;
              }
            }
            log("Callback not successfull: " + future.exception.errorText + "(" + future.exception.errorCode + "). :(" + input.item + JSON.stringify(this.id));
            input.success = false;
          }
          if (input.callback) {
            input.callback(input);
          }
        });
    } catch (exception) {
      log("Exception in replace: " + exception + " - " + JSON.stringify(exception) + " at " + input.item + " with ID " + input.localId);
      input.success = false;
      if (input.callback) {
        input.callback(input);
      }
    }
  }

  //will return public interface:
	return {
		/**
		 * Creates event, called from c++ part. Parameter is the iCal item data string.
		 * @param {Object} event
		 */
		createEvent: function (input) {
	    //log("createEvent called, be mean and call replace. Without id set result will be the same anyway.");
		  replaceItems(input);
	  },

		/**
		 * Updates an event. Parameters are the iCal item data string and the eventId.
		 * Called from c++.
		 * @param {Object} event
		 * @param {Object} eventId
		 */
	  replaceItems: replaceItems,

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
              itemDeleted += 1;
              if (this.eventsDeletedElement) {
                this.eventsDeletedElement.innerHTML = itemDeleted;
              }
              input.success = true;
				    } else {
				      itemDeleteFailed += 1;
				      if (this.eventsDeleteFailedElement) {
				        this.eventsDeleteFailedElement.innerHTML = itemDeleteFailed;
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
		  getItemsFromDB(
		    {
		      callback: createItemArray.bind(this, iCal.generateICal),
		      callback2: callback,
		      query: {
		        from: "info.mobo.syncml.calendarevent:1",
		        where: [ { prop: "_rev", op: ">", val: revs.calendar } ],
		        incDel: true
		      }
		    }
		  );
		},

		getNewContacts: function (callback) {
      log("Get new contacts called.");
      getItemsFromDB(
        {
          callback: createItemArray.bind(this, vCard.generateVCard),
          callback2: callback,
          query: {
            from: "info.mobo.syncml.contact:1",
            where: [ { prop: "_rev", op: ">", val: revs.contact } ],
            incDel: true
          }
        }
      );
    },

		getAllEvents: function (callback) {
		  log("Get all events called.");
		  getItemsFromDB({callback: createItemArray.bind(this, iCal.generateICal), callback2: callback, query: {from: "info.mobo.syncml.calendarevent:1"} }); //this query should just get all events.
		},

		getAllContacts: function (callback) {
      log("Get all contacts called.");
      getItemsFromDB({callback: createItemArray.bind(this, vCard.generatevCard), callback2: callback, query: {from: "info.mobo.syncml.contact:1"} }); //this query should just get all events.
    },

		checkCalendar: function (account) {
		  var query, calendar, obs;
			query = { from: "info.mobo.syncml.calendar:1", where: [ { prop: "accountId", op: "=", val: account.accountId } ] };

			log("Check calendar.");
			if (!account && !account.accountId) {
			  log("Did not get account! => failure.");
			  return;
			}
			if (account.datastores.calendar) {
				if (account.datastores.calendar.dbId !== undefined) {
					log("Have Calendar Id: " + account.datastores.calendar.dbId);
					DB.find(query, false, false).then(
					  function (future) {
					    var result = future.result, results, i;
					    if (result.returnValue === true) {
					      results = result.results;
					      for (i = 0; i < results.length; i += 1) {
					        if (results[i]._id === account.datastores.calendar.dbId) {
					          log("Found calendar, everything ok.. :)");
					          return;
					        }
					      }
					      //if we reached this point, calendar was not found..
					      log("Calendar not found.. :(");
					      account.datastores.calendar.dbId = undefined;
					      itemCallbacks.checkCalendar(account);
					    }
					  }
					);
				} else {
					log("Need to create calendar account.");

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
					  function (future) {
					    if (future.result.returnValue === true) {
					      log("Created calendar: " + JSON.stringify(future.result.results));
					      if (future.result.results.length > 0) {
					        account.datastores.calendar.dbId = future.result.results[0].id;
					        SyncMLAccount.setAccount(account);
					        SyncMLAccount.saveConfig();
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

		startTrackingChanges: function (account) {
		  log("startTrackingChanges called.");
			try {
				log("Tracking changes for future updates.");
				DB.find({from: "info.mobo.syncml.calendarevent:1", select: ["_rev"]}).then(
				  function (future) {
				    var r = future.result, i;
				    if (r.returnValue === true) {
		          for (i = 0; i < r.results.length; i += 1) {
		            if (r.results[i]._rev > revs.calendar) {
		              revs.calendar = r.results[i]._rev;
		            }
		          }
		          if (account && account.datastores && account.datastores.calendar) {
		            account.datastores.calendar.lastRev = revs.calendar;
		            SyncMLAccount.setAccount(account);
		            SyncMLAccount.saveConfig();
	              log("Will sync all changes after rev " + revs.calendar);
		          } else {
		            log("Could not save new rev in account object... wrong parameters applied?");
		          }
				    } else {
				      log("Error in startTrackingchanges: " + future.exception.errorText + "( " + future.exception.errorCode + ") = " + JSON.stringify(future.exception));
				    }
				  }
				);
			} catch (exception) {
				log("Exception in startTrackingChanges: " + exception + " - " + JSON.stringify(exception));
			}
		},

		finishSync: function (account, successful) {
			var field, recEv;
		  try {
		    function updateParentId(events, id) {
		      var i, update = [];
		      if (!id || !id.result || id.result.length === 0) {
		        log("Got no ids, can't set parentIds. Most probably we don't have that event, or something went wrong during parsing...");
		      } else if (id.result.length > 1) {
		        log("Got " + id.result.length + " ids. Can't work with that... will take first id only.");
		      }
		      for (i = 0; i < events.length; i += 1) {
		        events[i].parentId = id.result[0]._id;
		        if (events[i]._id) { //prevent duplicate events here
		          update.push(events[i]);
		        } else {
		          log("Event somehow had no id set... can't update. :(");
		        }
		      }
		      replaceItems(update);
		    }

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
				if (successful) {
					itemCallbacks.startTrackingChanges(account);
				}

				itemUpdated = 0;
				itemUpdateFailed = 0;
				itemAdded = 0;
				itemAddFailed = 0;
				itemDeleted = 0;
				itemDeleteFailed = 0;
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

