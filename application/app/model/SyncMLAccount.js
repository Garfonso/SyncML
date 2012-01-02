//nomen: true needed to accept _id.
/*jslint indent: 2, nomen: true */
/*global DB, log */

var syncMLAccount = function () {
  "use strict";
  var version = 1;

  return {
    //TODO: make those things private members!
    username: undefined,
    password: undefined,
    url: undefined,
    name: undefined,

    syncContacts: false,
    syncContactsPath: undefined,
    syncContactsMethod: "slow",
    syncContactsNext: undefined,
    syncContactsServerNext: undefined,
    syncCalendar: false,
    syncCalendarPath: undefined,
    syncCalendarMethod: "slow",
    syncCalendarNext: undefined,
    syncCalendarServerNext: undefined,

    webOsAccountId: undefined,
    webOsCalendarId: undefined,
	  webOsCalendarRev: 0,
    webOsContactsId: undefined,
	  webOsContactsRev: 0,
	  dbId: undefined,

    saveConfig: function () {
      var acctObj, field, resultFunc;

      try {
        log("SaveCofnig called!!! For webos id: " + this.webOsAccountId + " and db id " + this.dbId);
        //log("saving info.mobo.syncml.store.accounts -> value:" + acctId);
        acctObj = {"_kind": "info.mobo.syncml.store.accounts:1"};
        for (field in this) {
          if (this.hasOwnProperty(field) && typeof this[field] !== "function" && field !== "controller" && field !== "delete" && field !== "_rev" && field !== "deviceId") {
            //log("acctObj[" + field + "] = " + this[field]);
            acctObj[field] = this[field];
          }
        }

        resultFunc = function (future) {
          var result = future.result;
          if (result.returnValue === true) {
            log("Result: " + JSON.stringify(result));
            log("Successfully put obj into db.");
            if (this.dbId === undefined) {
              log("Read new db id: " + result.results[0].id + " was " + this.dbId);
              this.dbId = result.results[0].id;
            }
          } else {
            result = future.exception;
            log("put AcctId failure: Err code=" + result.errorCode + "Err message=" + result.message);
          }
        };

        if (this.dbId === undefined) {
          DB.put([acctObj]).then(this, resultFunc);
        } else {
          acctObj._id = this.dbId;
          DB.merge([acctObj]).then(this, resultFunc);
        }
      } catch (e) {
        log("Error: " + e.message + " - " + e.stack);
        log("Error: " + JSON.stringify(e));
      }
    },

    readFromConfig: function () {
      log("READFROMCONFIG==============");
      this.findAccount();
    },

  //get the accountId - if the returned JSON is blank then we know to create the account.
    findAccount: function () {
      var query = {"from": "info.mobo.syncml.store.accounts:1"}, i;

      DB.find(query, false, false).then(this, function (future) {
        log("DB find returned, result: " + JSON.stringify(future.result));
        var result = future.result, field;
        if (result.returnValue === true) {
          if (future.result.results.length > 0) {
            log("Got accountId: " + JSON.stringify(future.result.results[0]));
            result = future.result.results[0];
            log("Reading account from search result: ");
            for (field in result) {
              if (result.hasOwnProperty(field) && typeof result[field] !== "function" && field !== "_rev") {
                //log("result[" + field + "] = " + result[field]);
                this[field] = result[field];
              }
            }
            //this.webOsAccountId = result.webOsAccountId;
            this.dbId = result._id;

            /*this.username = result.username;
            this.password = result.password;
            this.name = result.name;
            this.url = result.url;
            this.syncCalendar = result.syncCalendar;
            this.syncContacts = result.syncContacts;
            this.syncContactsPath = result.syncContactsPath;
            this.syncContactsMethod = result.syncContactsMethod;
            this.syncCalendarPath = result.syncCalendarPath;
            this.syncCalendarMethod = result.syncCalendarMethod;

            this.webOsCalendarId = result.webOsCalendarId;
            this.webOsContactsId = result.webOsContactsId;
            this.webOsCalendarRev = result.webOsCalendarRev;
            this.webOsContactsRev = result.webOsContactsRev;*/

            if (this.webOsCalendarRev === undefined) {
              this.webOsCalendarRev = 0;
            }
            if (this.webOsContactsRev === undefined) {
              this.webOsContactsRev = 0;
            }
          } else {
            this.webOsAccountId = undefined;
            future.result = "";
          }

          //TODO: change this for multiple accounts!
          if (future.result && future.result.results && future.result.results.length > 1) {
            for (i = 1; i < future.result.results.length; i += 1) {
              this.deleteAccountConfig(future.result.results[i]._id);
            }
          }
        } else {
          result = future.exception;
          log("Cound not find accountId: Err code = " + result.errorCode + "Err message=" + result.message);
          this.webOsAccountId = undefined;
        }
      });
    },

    getCapabilities: function () {
      var caps = [];

      if (this.syncCalendar) {
        caps.push({ "id": "info.mobo.syncml.calendar", "capability": "CALENDAR" });
      }
      if (this.syncContacts) {
        caps.push({ "id": "info.mobo.syncml.contact", "capability": "CONTACTS" });
      }

      log("Capabilitproviders: " + JSON.stringify(caps));
      return caps;
    },

    parseCapabilities: function (caps) {
      var i;
      this.syncCalendar = false;
      this.syncContacts = false;
      for (i = 0; i < caps.length; i += 1) {
        if (caps[i].capability === "CALENDAR") {
          this.syncCalendar = true;
          log("Calendar cap set, will sync calendar");
        } else if (caps[i].capability === "CONTACTS") {
          this.syncContacts = true;
          log("Contact cap set, will sync contacts");
        }
      }
    },

    createAccount: function (success, error) {
      this.controller.serviceRequest("palm://com.palm.service.accounts/", {
        method: "createAccount",
        parameters: {"templateId"          : "info.mobo.syncml.account",
               "capabilityProviders" : this.getCapabilities(),
               "username"            : this.username,
               "alias"         : this.name,
               "credentials"         : {"common": { "password" : this.password }},
               "config"              : {  "url": this.url, "syncContacts": this.syncContacts, "syncContactsPath": this.syncContactsPath, "syncContactsMethod": this.syncContactsMethod,
                                          "syncCalendar": this.syncCalendar, "syncCalendarPath": this.syncCalendarPath, "syncCalendarMethod": this.syncCalendarMethod }
          },
        onSuccess: function (e) { log("Account object = " + JSON.stringify(e)); this.webOsAccountId = e.result._id; this.saveConfig(); if (success !== undefined) { success.call(); } }.bind(this),
        onFailure: function (e) { log("createAccount failure: errorCode = " + e.errorCode + ", errorText = " + e.errorText); if (error !== undefined) { error.call(); } }.bind(this)
      });
    },

    deleteAccountConfig: function (id) {
      var deleteSelf = true, toDelId = this.dbId, ids;

      if (id !== undefined) {
        deleteSelf = false;
        toDelId = id;
      }

      if (toDelId !== undefined) {
        ids = [toDelId];
        this.controller.serviceRequest("palm://com.palm.db/", {
          method: "del",
          parameters: {
            "ids": ids
          },
          onSuccess: function (e) {
            log("del success!" + JSON.stringify(e));
            log("del #1, id=" + e.results[0].id + ", rev=" + e.results[0].rev);
            if (deleteSelf) {
              this.dbId = undefined;
            }
          }.bind(this),
          onFailure: function (e) {
            log("del failure! Err = " + JSON.stringify(e));
          }
        });
      }
    },

    deleteAccount: function () {
      if (this.webOsAccountId !== undefined) {
        this.controller.serviceRequest("palm://com.palm.service.accounts/", {
          method: "deleteAccount",
          parameters: {
            "accountId": this.webOsAccountId
          },
          onSuccess: function (e) {
            log("delte account success" + JSON.stringify(e) + "\n");
            this.webOsAccountId = undefined;
            this.deleteAccountConfig();
          }.bind(this),
          onFailure: function (e) {
            log("deleteAccount failure" + JSON.stringify(e));
          }.bind(this)
        });
      } else {
        this.deleteAccountConfig();
      }
    },

    getAccountInfo: function (success, error) {
      this.controller.serviceRequest("palm://com.palm.service.accounts/", {
        method: "getAccountInfo",
        parameters: {
          "accountId": this.webOsAccountId
        },
        onSuccess: function (e) {
          log("getAccountInfo success" + JSON.stringify(e) + "\n");
          this.name = e.result.alias;
          this.parseCapabilities(e.result.capabilityProviders);
          this.username = e.result.username;
          if (success !== undefined) {
            success.call();
          }
        }.bind(this),
        onFailure: function (e) {
          log("getAccountInfo failure: errorCode = " + e.errorCode + ", errorText = " + e.errorText);
          if (error !== undefined) {
            error.call();
          }
        }.bind(this)
      });
    },

    //can be used to change capabilities, too:
    modifyAccount: function () {
      this.controller.serviceRequest("palm://com.palm.service.accounts/", {
        method: "modifyAccount",
        parameters: {"accountId": this.webOsAccountId,
          object: {
            "username": this.username,
            "capabilityProviders": this.getCapabilities(),
            "alias": this.name,
            "credentials": {
              "common": {
                "password": this.password
              }
            },
            "config": {
              "url": this.url,
              "syncContactsPath": this.syncContactsPath,
              "syncContactsMethod": this.syncContactsMethod,
              "syncCalendarPath": this.syncCalendarPath,
              "syncCalendarMethod": this.syncCalendarMethod
            } //this will go to transport service...??? Why don't I get that with getAccountInfo? :(
          }
          },
        onSuccess: function (e) { log("Account modified = " + JSON.stringify(e)); this.saveConfig(); },
        onFailure: function (e) { log("modifiyAccount failure: errorCode = " + e.errorCode + ", errorText = " + e.errorText); }
      });
    }
  };
};

//TODO: get rid of global account object somehow? :(
var account = syncMLAccount();
