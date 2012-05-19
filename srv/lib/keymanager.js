/*global PalmCall, Base64, log, setTimeout, Future */

var KeyManager = (function () {
  var keyname = "syncmlpasswordkey";

  //check if key already exists. If not, create key.
  function checkKey(callback) {
    //this makes sure that the key exists. This seems a bit brutal, but at least till webOs 2.2.4
    //there is an error that, when called from node.js service, the PalmCall with keymanager does not
    //return, if it should just return unsuccessfully. 
    //So if the key does not exist, keyInfo will never return.
    //But if the key  exists, generate will never return.
    //That means, to be sure that the key exists and that something returns a callback,
    //we just call keyInfo and generate. One will always return and the key will exist. :)
    log("Checking if key exists.");
    PalmCall.call("palm://com.palm.keymanager/", "keyInfo", { keyname: keyname}).then(function (future) {
      if (future.result.returnValue === true) {
        log("Key exists. All is fine. :) " + JSON.stringify(future.result));
        if (callback) {
          callback(true);
        }
      } else {
        //will never happen, due to the bug.
        log("No key, need to create key." + JSON.stringify(result));
      }
    });
    PalmCall.call("palm://com.palm.keymanager", "generate", { "keyname": keyname, "size": 32, "type": "AES", "nohide" : false }).then(function(future) {
      if (future.result.returnValue === true) {
        log("Key created. All is fine. :) " + JSON.stringify(future.result));
        if (callback) {
          callback(true);
        }
      } else {
        log("Key not created. Nothing is fine. :( " + JSON.stringify(result));
        if (callback) {
          callback(false);
        }
      }
    });
  }
  
  return {
    checkKey: checkKey,

    decrypt: function (name, obj) {
      var future = new Future();
//      setTimeout(future.callback(function () {
//        //log("Setting result: " + data);
//        var res = {returnValue: true};
//        res[name] = data;
//        future.result = res;
//        //log("Future result is: " + future.result);
//      }), 100);
//      return future;
      //don't try to decrypt if already decrypted.
      log("Trying to decrypt " + name + " = " + obj[name+"_enc"]);
      if (obj[name+"_enc"] === undefined || obj[name+"_enc"] == "") {
        log("No encrypted data. Return ok to be backwads compatible.");
        setTimeout(function() { future.result = {returnValue: true}; }, 100);
        return future;
      }
      try {
        PalmCall.call("palm://com.palm.keymanager/", "crypt", {
          "keyname": keyname, 
          "algorithm" : "AES", 
          "decrypt": true, 
          "data": obj[name+"_enc"]
        }).then(function (f) {
          var result = f.result;
          if (result.returnValue === true) {
            obj[name] = Base64.decode(result.data);
          } else {
            log("Problem during decryption of " + name + ": ");
            log(JSON.stringify(result));
          }
          future.result = {returnValue: result.returnValue};
        });
      } catch (e) {
        log("Error in decrypt: " + JSON.stringify(e));
        future.result = {returnValue: false};
      }
      return future;
    },
    
    encrypt: function (name, data, obj) {
      var future = new Future();
//      setTimeout(future.callback(function () {
//        //log("Setting result: " + data);
//        future.result = {data: data, returnValue: true};
//        //log("Future result is: " + future.result);
//      }), 100);
//      return future;
      //don't try to encrypt, if already encrypted.
      log("Trying to encrypt " + name);
      if (typeof data == "undefined" || data == "") {
        log("No data received, return.");
        setTimeout(function() { future.result = {returnValue: false}; }, 100);
        return future;
      }
      try {
        PalmCall.call("palm://com.palm.keymanager/", "crypt", {
          "keyname": keyname, 
          algorithm: "AES", 
          decrypt: false, 
          data: Base64.encode(data)
        }).then(function (f) {
          var result = f.result;
          if (result.returnValue === true) {
            obj[name+"_enc"] = result.data;
          } else {
            log("Problem during encryption of " + name + ": ");
            log(JSON.stringify(result));
          }
          future.result = {returnValue: result.returnValue};
        });
      } catch (e) {
        log("Error in encrypt: " + JSON.stringify(e));
      }
      return future;
    },
    
    initialize: function (future) {
      checkKey(function(success) {
        var res = future.result;
        res.keymanager = success;
        future.result = res;
      });
      return future;
    }
  };
}());