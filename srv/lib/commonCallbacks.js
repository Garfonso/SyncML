//JSLint options:
/*global log, logError_lib, DB, Future, moboCopy */

var commonCallbacks = (function () {
  "use strict";
  
  //will return public interface:
	return {
  
    getItemsFromDB: function(input) {
      try {
        log("Getting items: " + JSON.stringify(input.query));
        DB.find(input.query, false, false).then(
          function (future) {
            input.datastore.oldLastRev = input.datastore.lastRev;        
            input.datastore.lastRev = 0; //reset lastRev in case something to high was saved, for example from palm backup.
            try {
              var r = future.result;
              if (r.returnValue === true) {
                input.result = r.results;
                log("Got " + r.results.length + " items from db.");
                input.success = true;
              } else {
                log("Error in getItemsFromDB: " + JSON.stringify(future.exception));
                input.success = false;
              }
              delete r.results; //try to release memory.
              input.callback(input);
            } catch (e) {
              log("Error in getItemsFromDB(Future): ");
              log(JSON.stringify(e));
              input.success = false;
              input.callback(input);
              logError_lib(e);
            }
          }
        );
      } catch (exception) {
        log("Error in getContactsFromDB(main): ");
        log(JSON.stringify(exception));
        input.success = false;
        input.callback(input);
        logError_lib(exception);
      }
    },
  
		/**
		 * Deletes item with localId. Called from c++.
		 * @param {Object} {localId: itemId, stats: { deleteOK: int, delteFailed: int }, datastore: account.datastores.calendar/contacts }
		 */
		deleteItem: function (input) {
		  log("Delete item called with id: " + input.localId);
			try {
				var ids = [input.localId];
				//don't delete with purge=true!
				DB.del(ids, false).then(
				  function (future) {
				    try {
              var r = future.result;
              if (r.returnValue === true) {
                input.stats.deleteOk += 1;
                input.success = true;
                if (r.results[0].rev > input.datastore.lastRev) {
                  input.datastore.lastRev = r.results[0].rev;
                }
              } else {
                input.stats.deleteFailed += 1;
                log("Callback not successfull: " + future.exception.errorText + "(" + future.exception.errorCode + " for itemId: " + input.localId + "). :(");
                input.success = false;
              }
              input.callback(input);
				    } catch (e) {
	            log("Error in deleteItem(Future): ");
	            log(JSON.stringify(e));
	            input.success = false;
	            input.callback(input);
	            logError_lib(e);
	          }
				  }
				);
			} catch (exception) {
				log("Exception in deleteItem: " + exception + " - " + JSON.stringify(exception));
				input.success = false;
        input.callback(input);
        logError_lib(exception);
			}
		},

		/**
		 * Deletes all items by a call to palm database service.
     * @param {Object} input = {kind: db.kind, account: account, datastore: datastore}
		 */
		deleteAllItems: function (input) {
		  log("deleteAllItems called for " + input.kind + " from account " + input.account.accountId);
      try {
        DB.del({from: input.kind, where: [{prop: "accountId", op: "=", val: input.account.accountId}] }, false).then(this,
          function (future) {
            try {
              var r = future.result;
              if (r.returnValue === true) {
                log("Successfully deleted all elements: " + JSON.stringify(r));
                //input.callback({success: true});
								DB.put([{"_kind": input.kind, dummy: "dummy"}]).then(this, function (f) {
									if (f.result.returnValue === true) {
										log("did put dummy object. Id: " + f.result.results[0].id);
										input.localId = f.result.results[0].id;
										input.stats = { deleteOK: 0, delteFailed: 0};
										this.deleteItem(input);
									} else {
										log("Could not put dummy object.");
										log("Error in deleteAllItems: " + future.exception.errorText + " ( " + future.exception.errorCode + ")");
										input.callback({success: false});
									}
								});
								
              } else {
                log("Error in deleteAllItems: " + future.exception.errorText + "( " + future.exception.errorCode + ")");
                input.callback({success: false});
              }
            } catch (e) {
              log("Exception in deleteAllItems future: " + e + " - " + JSON.stringify(e));
              input.callback({success: false});
            }
          }
        );
			} catch (exception) {
				log("Exception in deleteAllItems: " + exception + " - " + JSON.stringify(exception));
				//something went wrong, continue sync:
				input.callback({success: false});
				logError_lib(exception);
			}
		},

		getLatestRev: function (account, kind) {
      var outerFuture = new Future();
		  log("getLatestRev called.");
			try {
				DB.find({from: kind,
				         where: [{prop: "accountId", op: "=", val: account.accountId}],
				         select: ["_rev"], incDel: true}).then(
				  function (future) {
            try {
              var r = future.result, i, rev = 0;
              if (r.returnValue === true) {
                for (i = 0; i < r.results.length; i += 1) {
                  if (r.results[i]._rev > rev) {
                    rev = r.results[i]._rev;
                  }
                }
                outerFuture.result = { returnValue: true, rev: rev };
              } else {
                log("Error in getLatestRev: " + future.exception.errorText + "( " + future.exception.errorCode + ") = " + JSON.stringify(future.exception));
                outerFuture.result = { returnValue: false };
              }
            } catch (exception) {
              log("Exception in getLatestRev-Future: " + exception + " - " + JSON.stringify(exception));
              outerFuture.result = { returnValue: false };
            }
				  }
				);
			} catch (exception) {
				log("Exception in getLatestRev: " + exception + " - " + JSON.stringify(exception));
        outerFuture.result = { returnValue: false };
			}
      return outerFuture;
		},

		finishSync: function (datastore, stats) {
      var index, date = new Date();
      try {
        //reset the saved lastRev. The oldLastRev was saved before the
        //first call to get items from the db.
        //if sync did go wrong, we want to get the changes from last time again
        // (or we want to keep the oldLastRev if there were no items at all (?))
        if (!datastore.ok || datastore.lastRev === 0) {
					if (!datastore.ok) {
						logToApp("Sync had issues, resetting lastRev.");
					}
          datastore.lastRev = datastore.oldLastRev;
        }
        
        if (!datastore.lastTen) {
          datastore.lastTen = [];
        }
        for (index = Math.max(10, datastore.lastTen.length-1); index > 0; index -= 1) { //copy stuff around.
          datastore.lastTen[index] = datastore.lastTen[index-1];
        }
        
        log("Did " + stats.addOK + " adds, " + stats.addFailed + " adds failed.");
        log("Did " + stats.updateOK + " updates, " + stats.updateFailed + " updates failed.");
        log("Did " + stats.deleteOK + " deletes, " + stats.deleteFailed + " deletes failed.");
        log("Did " + datastore.addOwn + " adds on server");
        log("Did " + datastore.replaceOwn + " updates on server");
        log("Did " + datastore.delOwn + " deletes on server");
        
        stats.addOwn = datastore.addOwn;
        stats.replaceOwn = datastore.replaceOwn;
        stats.delOwn = datastore.delOwn;
        datastore.stats = moboCopy(stats);

        //save outcome = ok, method and stats in db!
        datastore.lastTen[0] = {ok: datastore.ok, method: datastore.actual_method, confMethod: datastore.method, stats: moboCopy(stats), ts: date.getTime(), time: date.toLocaleString()};
        if (!datastore.allTimeStats) {
          datastore.allTimeStats = {};
        }
        if (!datastore.allTimeStats[datastore.actual_method]) {
          datastore.allTimeStats[datastore.actual_method] = 0;
        } 
        datastore.allTimeStats[datastore.actual_method] += 1;
        
        //maybe server requested slow sync, restore old method here.
        if (datastore.oldMethod) {
          datastore.method = datastore.oldMethod;
          delete datastore.oldMethod;
          
          //for slow and refresh switch to two-way fast sync after successful sync. Don't do that for one-way!
          /*if (datastore.ok && 
                (datastore.method === "slow" || datastore.method.indexOf("refresh") !== -1)) {
            datastore.method = "two-way";
          }*/
        }

				stats.updateOK = 0;
				stats.updateFailed = 0;
				stats.addOK = 0;
				stats.addFailed = 0;
				stats.deleteOK = 0;
				stats.deleteFailed = 0;
			} catch (exception) {
				logError_lib(exception);
			}
		}
	}; //end of public interface
}()); //selfinvoke function
