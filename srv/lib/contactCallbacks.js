//JSLint options:
/*global DB, log, vCard, SyncMLAccount */
"use strict";

var contactCallbacks = (function () {
  var ids = {}, //should set accountId, calendarId and contactsId before use.
    revs = { calendar: 0 }, //should be set before use.
    contactUpdated =  0,
    contactUpdateFailed = 0,
    contactAdded =  0,
    contactAddFailed = 0,
    contactDeleted = 0,
    contactDeleteFailed = 0;

  function getContactsFromDB(input) {
    try {
      log("Getting Contacts: " + JSON.stringify(input.query));
      DB.find(input.query, false, false).then(
        function (future) {
          var r = future.result;
          if (r.returnValue === true) {
            input.result = r.results;
            log("Got " + r.results.length + " Contacts to send to server.");
            input.success = true;
          } else {
            log("Error in getAllContacts: " + JSON.stringify(future.exception));
            input.success = false;
          }
          input.callback(input);
        }
      );
    } catch (exception) {
      log("Exception in getAllContacts: " + exception + " - " + JSON.stringify(exception));
      input.success = false;
      input.callback(input);
    }
  }

  function createContactArray(input) {
    //format Contact array for syncml and call callback: 
    var update = [], del = [], i, obj, result;
    if (input.success === true) {
      for (i = 0; i < input.result.length; i += 1) {
        try {
          result = input.result[i];
          //log("Got Contact: " + JSON.stringify(result));
          if (result._del === true) {
            obj = { localId: result._id, uid: result.uId};
            del.push(obj);
          } else {
            obj = { localId: result._id, data: vCard.generateVCard(result), uid: result.uId};
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
    return newObj;
  }

  function updateContact(input) {
    log("Update Contact called");
    try {
      var e, recId = undefined, childId = undefined;
      if (input.contact) {
        e = [input.contact];
      } else {
        e = [vCard.parseVCard(input.item)];
      }
      log("contact: " + JSON.stringify(e[0].name) + " with id: " + input.localId);
      e[0]._id = input.localId;
      e[0].accountId = ids.accountId;
      e[0]._kind = "info.mobo.syncml.contact:1";
      DB.merge(e).then(clone({ id: e[0]._id }), //try to prevent others from overwriting data for this object. :(
        function (future) {
          var r = future.result;
          if (r.returnValue === true) {
            if (!this.id) {
              contactAdded += 1;
              if (this.contactsAddedElement) {
                this.contactsAddedElement.innerHTML = contactAdded;
              }
            } else {
              contactUpdated += 1;
              if (this.contactsUpdatedElement) {
                this.contactsUpdatedElement.innerHTML = contactUpdated;
              }
            }
            input.localId = r.results[0].id;
            input.success = true;
          } else {
            if (this.id) {
              contactAddFailed += 1;
              if (this.contactsAddFailedElement) {
                this.contactsAddFailedElement.innerHTML = contactAddFailed;
              }
            } else {
              contactUpdateFailed += 1;
              if (this.contactsUpdateFailedElement) {
                this.contactsUpdateFailedElement.innerHTML = contactUpdateFailed;
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
      log("Exception in updateContact: " + exception + " - " + JSON.stringify(exception) + " at " + input.item + " with ID " + input.localId);
      input.success = false;
      if (input.callback) {
        input.callback(input);
      }
    }
  }

  //will return public interface:
	return {
		/**
		 * Creates contact, called from c++ part. Parameter is the iCal item data string.
		 * @param {Object} contact
		 */
		createContact: function (input) {
	    updateContact(input);
	  },

		/**
		 * Updates an contact. Parameters are the iCal item data string and the contactId.
		 * @param {Object} contact
		 * @param {Object} contactId
		 */
	  updateContact: updateContact,

		/**
		 * Deletes contact with contactId. Called from c++.
		 * @param {Object} contactid
		 */
		deleteContact: function (input) {
		  log("Delete contact called with id: " + input.localId);
			try {
				var ids = [input.localId];
				//delete with purge=true.
				DB.del(ids, true).then(
				  function (future) {
				    var r = future.result;
				    if (r.returnValue === true) {
              contactDeleted += 1;
              if (this.contactsDeletedElement) {
                this.contactsDeletedElement.innerHTML = contactDeleted;
              }
              input.success = true;
				    } else {
				      contactDeleteFailed += 1;
				      if (this.contactsDeleteFailedElement) {
				        this.contactsDeleteFailedElement.innerHTML = contactDeleteFailed;
				      }
				      log("Callback not successfull: " + future.exception.errorText + "(" + future.exception.errorCode + " for contactId: " + input.localId + "). :(");
				      input.success = false;
				    }
				    input.callback(input);
				  }
				);
			} catch (exception) {
				log("Exception in deleteContact: " + exception + " - " + JSON.stringify(exception));
				input.success = false;
        input.callback(input);
			}
		},

		/**
		 * Deletes all contacts by a call to palm database service.
		 */
		deleteAllContacts: function (input) {
		  log("deleteAllContacts called.");
      try {
        //delete with purge=true.
        DB.del({from: "info.mobo.syncml.contact:1", where: [{prop: "accountId", op: "=", val: ids.accountId}]}, true).then(
          function (future) {
            var r = future.result;
            if (r.returnValue === true) {
              log("Successfully deleted all elements.");
              input.callback({success: true});
            } else {
              log("Error in deleteAllContacts: " + future.exception.errorText + "( " + future.exception.errorCode + ")");
              input.callback({success: false});
            }
          }
        );
			} catch (exception) {
				log("Exception in deleteAllContacts: " + exception + " - " + JSON.stringify(exception));
				//something went wrong, continue sync:
				input.callback({success: false});
			}
		},

		getNewContacts: function (input) {
		  log("Get new contacts called.");
		  getContactsFromDB(
		    {
		      callback: createContactArray,
		      callback2: input.callback,
		      serverId: input.serverId,
		      query: {
		        from: "info.mobo.syncml.contact:1",
		        where: [ { prop: "_rev", op: ">", val: revs.calendar }, {prop: "accountId", op: "=", val: ids.accountId} ],
		        incDel: true
		      }
		    }
		  );
		},

		getAllContacts: function (input) {
		  log("Get all contacts called.");
		  getContactsFromDB({callback: createContactArray, callback2: input.callback, serverId: input.serverId, query: {from: "info.mobo.syncml.contact:1", 
		    where: [{prop: "accountId", op: "=", val: ids.accountId}]} }); //this query should just get all contacts.
		},

		startTrackingChanges: function (account) {
		  log("startTrackingChanges called.");
			try {
				log("Tracking changes for future updates.");
				DB.find({from: "info.mobo.syncml.contact:1", where: [{prop: "accountId", op: "=", val: ids.accountId}], select: ["_rev"]}).then(
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
				if (successful) {
					contactCallbacks.startTrackingChanges(account);
				}

				log("Did " + contactAdded + " adds, " + contactAddFailed + " adds failed.");
				log("Did " + contactUpdated + " updates, " + contactUpdateFailed + " updates failed.");
				log("Did " + contactDeleted + " deletes, " + contactDeleteFailed + " deletes failed.");
				contactUpdated = 0;
				contactUpdateFailed = 0;
				contactAdded = 0;
				contactAddFailed = 0;
				contactDeleted = 0;
				contactDeleteFailed = 0;
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

