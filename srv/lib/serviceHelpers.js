/*global IMPORTS, libraries, Mojo, MojoLoader */

try {
  console.error("Starting to load libraries");
  var Foundations = IMPORTS.foundations;
  var Future = Foundations.Control.Future; // Futures library
	var DB = Foundations.Data.DB;  // db8 wrapper library
	var PalmCall = Foundations.Comms.PalmCall;
  var AjaxCall = Foundations.Comms.AjaxCall;
  var Calendar = IMPORTS.calendar; 

	console.error("--------->Loaded Libraries OK");
} catch (Error) {
  console.error("Error during loading libraries: " + Error);
}

var locked = false;

var log = function (logmsg) {
	console.error(logmsg);
};

var logStatus = function (logmsg) {
  console.error("=================================================================================");
  console.error("================ SYNCSTATUS: ====================================================");
  console.error(logmsg);
  console.error("=================================================================================");
};

//simple logging - requires target HTML element with id of "targOutput"
var logGUI = function (controller, logInfo) {
	console.error(logInfo);
	logInfo = "" + logInfo;
	logInfo = logInfo.replace(/</g, "&lt;");
	logInfo = logInfo.replace(/>/g, "&gt;");
	this.targOutput = controller.get("logOutput");
	this.targOutput.innerHTML =  logInfo + "<br/>" + this.targOutput.innerHTML;
};

var initialize = function(params) {
  var future = new Future(), innerFuture = new Future({}), initFinishCheck;
  log("initialize helper");
  if (params.iCal) {
    iCal.intitialize(innerFuture);
  }
  
  initAccounts = function (f) {
    log("Init Accounts");
    var i = 0, gotAccountInfo;
    gotAccountInfo = function(result) {
      i -= 1;
      if (i === 0) {
        var res = f.result;
        res.accounts = true;
        f.result = res;
      }
    };
    
    log("Starting findAccounts");
    SyncMLAccount.findAccounts(function () {
      log("Accounts finished.");
      if (params.accountsInfo) {
        var account = SyncMLAccount.getAccount();
        while (account) {
          if (account.accountId) {
            log("Getting account info");
            SyncMLAccount.getAccountInfo(account, gotAccountInfo);
            i += 1;
          }
          account = SyncMLAccount.getNextAccount();
        }
      }
      if (i === 0) {
        var res = f.result;
        res.accounts = true;
        f.result = res;
      }
    });
  };
  
  //checks if all inner init functions are finished. Only then it will set a result for the outer future.
  initFinishCheck = function (f) {
    if (f.result) {
      if (((params.iCal && f.result.iCal) || !params.iCal) && 
          ((params.devID && f.result.devID) || !params.devID) && 
          ((params.keymanager && f.result.keymanager) || !params.keymanager) && 
          ((params.accounts && f.result.accounts) || !params.accounts)
          ) {
        //finished. :)
        log ("Init of all parts finished.");
        future.result = { returnValue: true};
      } else {
        log("Init not finished yet " + JSON.stringify(f.result));
        setTimeout( function() { f.then(initFinishCheck); }, 500);
        
        if (f.result.keymanager && !f.result.accounts && params.accounts) {
          initAccounts(innerFuture);
        }
      }
    }
  };
  
  //get devide id:
  if (params.devID) {
    if (!DeviceProperties.devID) {
      PalmCall.call('palm://com.palm.preferences/systemProperties', "Get", {"key": "com.palm.properties.nduid" }).then(function (f) {
        if (f.result.returnValue === true) {
          DeviceProperties.devID = f.result["com.palm.properties.nduid"];
          log("Got deviceId: " + DeviceProperties.devID);
          var res = innerFuture.result;
          res.devID = true;
          innerFuture.result = res;
        } else {
          log("Could not get device id: " + JSON.stringify(f.result));
        }
      });
    } else {
      log("DeviceID still present");
      var res = innerFuture.result;
      res.devID = true;
      innerFuture.result = res;
    }
  }
  
  if (params.keymanager) {
    KeyManager.initialize(innerFuture);
  }

  innerFuture.then(initFinishCheck);
  return future;
};

//...
//...Base64 encode/decode functions. Plaxo expects Base64 encoding for username/password.
//...
/**
*  Base64 encode / decode
*  http://www.webtoolkit.info/
**/ 
var Base64 = {
  // private property
  _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
  // public method for encoding
  encode : function (input) {
      var output = "";
      var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
      var i = 0;
      input = Base64._utf8_encode(input);
      while (i < input.length) {
          chr1 = input.charCodeAt(i++);
          chr2 = input.charCodeAt(i++);
          chr3 = input.charCodeAt(i++);

          enc1 = chr1 >> 2;
          enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
          enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
          enc4 = chr3 & 63;

          if (isNaN(chr2)) {
              enc3 = enc4 = 64;
          } 
          else if (isNaN(chr3)) {
              enc4 = 64;
          }

          output = output +
          this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
          this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
      }
      return output;
  },

  // public method for decoding
  decode : function (input) {
      var output = "";
      var chr1, chr2, chr3;
      var enc1, enc2, enc3, enc4;
      var i = 0;

      input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

      while (i < input.length) {

          enc1 = this._keyStr.indexOf(input.charAt(i++));
          enc2 = this._keyStr.indexOf(input.charAt(i++));
          enc3 = this._keyStr.indexOf(input.charAt(i++));
          enc4 = this._keyStr.indexOf(input.charAt(i++));

          chr1 = (enc1 << 2) | (enc2 >> 4);
          chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
          chr3 = ((enc3 & 3) << 6) | enc4;

          output = output + String.fromCharCode(chr1);

          if (enc3 != 64) {
              output = output + String.fromCharCode(chr2);
          }
          if (enc4 != 64) {
              output = output + String.fromCharCode(chr3);
          }
      }
      output = Base64._utf8_decode(output);

      return output;
  },
  // private method for UTF-8 encoding
  _utf8_encode : function (string) {
      string = string.replace(/\r\n/g,"\n");
      var utftext = "";

      for (var n = 0; n < string.length; n++) {
           var c = string.charCodeAt(n);
           if (c < 128) {
              utftext += String.fromCharCode(c);
          }
          else if((c > 127) && (c < 2048)) {
              utftext += String.fromCharCode((c >> 6) | 192);
              utftext += String.fromCharCode((c & 63) | 128);
          }
          else {
              utftext += String.fromCharCode((c >> 12) | 224);
              utftext += String.fromCharCode(((c >> 6) & 63) | 128);
              utftext += String.fromCharCode((c & 63) | 128);
          }
       }
       return utftext;
  },
  // private method for UTF-8 decoding
  _utf8_decode : function (utftext) {
      var string = "";
      var i = 0;
      var c = 0, c2 = 0;

      while ( i < utftext.length ) {
          c = utftext.charCodeAt(i);
          if (c < 128) {
              string += String.fromCharCode(c);
              i++;
          }
          else if((c > 191) && (c < 224)) {
              c2 = utftext.charCodeAt(i+1);
              string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
              i += 2;
          }
          else {
              c2 = utftext.charCodeAt(i+1);
              c3 = utftext.charCodeAt(i+2);
              string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
              i += 3;
          }
      }
      return string;
  }
};