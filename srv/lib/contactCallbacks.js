//JSLint options:
/*global DB, log, logError_lib, vCard, SyncMLAccount, commonCallbacks */

var contactCallbacks = (function () {
  "use strict";
  var stats = 
    { 
      deleteOK: 0, 
      delteFailed: 0,
      updateOK: 0,
      updateFailed: 0,
      addOK: 0,
      addFailed: 0
    };
    
  function updateContact(input) {
    log("Update contact called");
    var doUpdate = function (input, future) {
      try {
        if (future.result.returnValue === true && future.result.results && future.result.results.length === 1) {
        var contact = future.result.results[0], c = [contact];
        c[0]._id = input.localId;
				c[0]._onServer = true; //contact came from server.
        c[0].accountId = input.account.accountId;
        log("Contact: " + JSON.stringify(c[0].name) + " with id: " + input.localId);
        
        //continue update.
        c[0]._kind = "info.mobo.syncml.contact:1";
        DB.merge(c).then(
          function (f) {
            try {
              var r = f.result;
              if (r.returnValue === true) {
                if (input.localId) {
                  stats.updateOK += 1;
                } else {
                  stats.addOK += 1;
                }
                input.localId = r.results[0].id;
                input.success = true;

                if (r.results[0].rev > input.account.datastores.contacts.lastRev) {
                  input.account.datastores.contacts.lastRev = r.results[0].rev;
                }
              } else {
                if (input.localId) {
                  stats.addFailed += 1;
                } else {
                  stats.updateFailed += 1;
                }
                log("Callback not successfull: " + future.exception.errorText + "(" + future.exception.errorCode + "). :(" + input.item + JSON.stringify(input.localId));
                input.success = false;
              }
              if (input.callback) {
                input.callback(input);
              }
            } catch (e) {
              logError_lib(e);
            }
          });
        } else {
          log("ERROR: Could not convert " + input.item + " to contact!");
          input.success = false;
          if (input.callback) {
            input.callback(input);
          }
        }
      } catch (exception) {
        log("Exception in UpdateContact(doUpdate): " + exception + " - " + JSON.stringify(exception) + " at " + input.item + " with ID " + input.localId);
        input.success = false;
        if (input.callback) {
          input.callback(input);
        }
        logError_lib(exception);
      }
    };

    //convert contact:
    try {
      if (input.contact) {
        doUpdate(input, { result: { returnValue: true, results: [input.contact]}}); //short cut.
      } else {
        log("converting vCard to webOS data type:");
        vCard.parseVCard({account: input.account, vCard: input.item, serverData: input.serverData, accountName: input.account.name}).then(doUpdate.bind(this, input));
      }
    } catch (e) {
      log("Error in updateContact(main): ");
      log(JSON.stringify(e));
      input.success = false;
      if (input.callback) {
        input.callback(input);
      }
      logError_lib(e);
    }
  }
	
	function applyContactHacks(contact, serverData) {
		var i, haveHome = false, haveWork = false, mail, problem = false, newMails = [], removeEmail = function (mail) {
			problem = true;
			if (mail.type === "type_home" && !haveWork) {
				mail.type = "type_work";
				haveWork = true;
				newMails.push(mail);
				log("keep mail " + mail.value + " with changed type of " + mail.type);
				return;
			}
			if (mail.type === "type_work" && !haveHome) {
				mail.type = "type_home";
				haveHome = true;
				newMails.push(mail);
				log("keep mail " + mail.value + " with changed type of " + mail.type);
				return;
			}
			
			contact.note += "\nE-Mail: " + mail.value;
			log("Removed mail " + mail.value + " with type " + mail.type);
			log("new note: " + contact.note);
		};
		
		//eGroupware can't handle many e-mail adresses. It allows to have only one work and one home address at a time..
		//repair contact and modify it in database. When callback comes back, generate vCard.
		if (contact.emails.length > 1) {
			log("Having more than one e-mails.");
			log("ServerMan: " + serverData.serverMan);
			if (serverData && serverData.serverMan  && serverData.serverMan.toLowerCase().indexOf("egroupware") > -1) {
				log("Server is egroupware. Check e-Mails. Server can only handle one work and one home address per contact!");
				for (i = 0; i < contact.emails.length; i += 1) {
					mail = contact.emails[i];
					log("Got mail " + mail.value + " of type " + mail.type);
					
					if (mail.type === "type_work") {
						log("work");
						if (haveWork) {
							log("had work already, kill this email.");
							removeEmail(mail);
						} else {
							log("keep this work mail.");
							newMails.push(mail);
							haveWork = true;
						}
					} else if (mail.type === "type_home") {
						log("home");
						if (haveHome) {
							log("had home already, kill this email.");
							removeEmail(mail);
						} else {
							log("keep this home mail.");
							newMails.push(mail);
							haveHome = true;
						}
					} else {
						log ("Unsupported type. Will try to change it.");
						if (!haveHome) {
							log("modified to home");
							mail.type = "type_home";
							haveHome = true;
							newMails.push(mail);
						} else if (!haveWork) {
							log("modified to work");
							mail.type = "type_work";
							haveWork = true;
							newMails.push(mail);
						} else {
							removeEmail(mail);
						}
						problem = true;
					}
				}
			}
		}
		
		if (problem) {
			log("now have " + newMails.length + " mails of " + contact.emails.length);
			contact.emails = newMails;
		}
		return problem;
	}
  
  function createContactArray(input) {
    //format contacts array for syncml and call callback: 
    var update = [], del = [], add = [], i, obj, result, callback, updates = 0, 
			hackUpdateCallback = function (f) {
				var r = f.result;
				if (r.returnValue !== true) {
					log("Updated of modified contact failed.");										
					log(JSON.stringify(r));
				}
				vCard.generateVCard(this).then(this.obj, callback);
			};
    callback = function (future) {
      try {
        if (future.result.returnValue === true) {
          this.data = future.result.result;
					if (this.noAdd === true) {
            log("Item was on server already, adding to update list: " + JSON.stringify(this.noAdd));
            update.push(this);
          } else {
            log("Item was not on server yet, adding to add list");
            if (this.contact) {
              log("Saving that this will be added to server.");
              this.addOK -= 1; //be optimistic here.
              updateContact(this); //save that we added the contact to the server.. this is not 100% correct here, sync may still fail.. but that should trigger a slow sync anyway, shouldn't it?
            }
            add.push(this);
          } 
          updates -= 1;
          log("Remaining updates: " + updates);
          if (updates === 0) {
            input.callback2({add: add, del: del, replace: update, success: input.success}); //still can't distinguish between new and changed items.
          }
        } else {
          log("Error in createContactArray(callback): ");
          log(JSON.stringify(future.result));
          input.success = false;
          input.callback(input);        
        }
      } catch (e) {
        log("Error in createContactArray(callback): ");
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
            if (result._rev > input.account.datastores.contacts.lastRev) {
              input.account.datastores.contacts.lastRev = result._rev;
            }
            
            log("Got contact: " + JSON.stringify(result));						
            if (result._del === true) {
              obj = { localId: result._id, uid: result.uId};
              del.push(obj);
            } else {
              obj = { localId: result._id, uid: result.uId, noAdd: result._onServer, contact: result, account: input.account};
              updates += 1;
							
							if (applyContactHacks(result, input.account.datastores.contacts)) {
								//copy data into new object that will be "this" in callback.
								DB.merge([result]).then({contactId: result._id, contact: result, accountName: input.account.name, serverData: input.serverData, obj: obj}, hackUpdateCallback);
							} else {
								vCard.generateVCard({contactId: result._id, contact: result, accountName: input.account.name, serverData: input.serverData}).then(obj, callback);
							}
            }
          } catch (e) {
            log("Error while adding element " + i + " of " + input.result.length + ". Error: " + JSON.stringify(e));
            logError_lib(e);
          }
        }
      }
      if (updates === 0) {//had no vCard conversions.
        input.callback2({add: add, del: del, replace: update, success: input.success}); //still can't distinguish between new and changed items.
      }
    } catch (error) {
      log("Error in createContactArray(main): ");
      log(JSON.stringify(error));
      input.success = false;
      input.callback(input);
      logError_lib(error);
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
		 * @param {Object} input with localId = local dbId, account = full account obj.
		 * @param {Object} contactId
		 */
	  updateContact: updateContact,

		/**
		 * Deletes contact with contactId. Called from c++.
		 * @param {Object} contactid
		 */
    deleteContact: function (input) {
      input.datastore = input.account.datastores.contacts;
      input.stats = stats;
      commonCallbacks.deleteItem(input);
		},

		/**
		 * Deletes all contacts by a call to palm database service.
		 */
		deleteAllContacts: function (input) {
			input.datastore = input.account.datastores.calendar;
      input.kind = "info.mobo.syncml.contact:1";
      commonCallbacks.deleteAllItems(input);
		},

		getNewContacts: function (input) {
		  log("Get new contacts called.");
		  commonCallbacks.getItemsFromDB(
		    {
		      callback: createContactArray,
		      callback2: input.callback,
		      serverData: input.serverData,
		      query: {
		        from: "info.mobo.syncml.contact:1",
            //select: ["_rev", "_id", "name"],
		        where: [ { prop: "_rev", op: ">", val: input.account.datastores.contacts.lastRev }, {prop: "accountId", op: "=", val: input.account.accountId} ],
		        incDel: true
		      },
          datastore: input.account.datastores.contacts,
          account: input.account
		    }
		  );
		},

		getAllContacts: function (input) {
		  log("Get all contacts called.");
		  commonCallbacks.getItemsFromDB(
        {
          callback: createContactArray, 
          callback2: input.callback, 
          serverData: input.serverData, 
          query: {
            from: "info.mobo.syncml.contact:1",
            //select: ["_rev", "_id", "name"],
            where: [ { prop: "accountId", op: "=", val: input.account.accountId } ]
          }, 
          datastore: input.account.datastores.contacts,
          account: input.account
        }
      ); //this query should just get all contacts.
		},

		getLatestRev: function (account) {
      return commonCallbacks.getLatestRev(account, "info.mobo.syncml.contact:1");
		},

		finishSync: function (account, outerFuture) {
      vCard.cleanUp(account).then(function (future) {
        var res = outerFuture.result;
        if (!res) {
          res = {};
        }
        res.contacts = true;
        outerFuture.result = res;
      });
      commonCallbacks.finishSync(account.datastores.contacts, stats);
		}
	}; //end of public interface
}()); //selfinvoke function
