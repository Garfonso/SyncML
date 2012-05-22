/*global IMPORTS, libraries, Mojo, MojoLoader */

try {
  console.error("Starting to load libraries");
  var Foundations = IMPORTS.foundations;
  var Future = Foundations.Control.Future; // Futures library
	var DB = Foundations.Data.DB;  // db8 wrapper library
	var PalmCall = Foundations.Comms.PalmCall;
  var AjaxCall = Foundations.Comms.AjaxCall;
  var Calendar = IMPORTS.calendar; 
  var path = IMPORTS.require('path');
  var fs = IMPORTS.require('fs');
  //for "local" AjaxCall fix:
  var urlModule = IMPORTS.require('url');
  var httpModule = IMPORTS.require('http');
  var bufferModule = IMPORTS.require('buffer');
  var Err = Foundations.Err;

  try {
    var stats = fs.statSync("/media/internal/.info.mobo.syncml.log");
    if (stats.size > 2097152) {
      console.error("Truncating log file, size was " + stats.size);
      var fd = fs.openSync("/media/internal/.info.mobo.syncml.log","a");
      fs.truncateSync(fd, 2097152); //truncate log to 2MB.
      fs.closeSync(fd);
    }
  } catch (error) {
    console.error("No logfile present, yet? " + error);
  }
  
	console.error("--------->Loaded Libraries OK");
} catch (Error) {
  console.error("Error during loading libraries: " + Error);
}

var locked = false;
var previousOperationFuture = new Future();

var finishAssistant = function(outerFuture, result) {
  locked = false;
  previousOperationFuture.result = {go: true};
  outerFuture.result = result;
};

var stream;
var log = function (logmsg) {
	console.error(logmsg);
	try {
	  if (typeof stream == "undefined") {
	    stream = fs.createWriteStream("/media/internal/.info.mobo.syncml.log", {flags:"a"});
	  }
	  stream.write(logmsg + "\n");
	  //stream.end();
	} catch(e) {
	  console.error("Unable to write to file: " + e);
	}
};

var logSubscription = undefined;
var logToApp = function (logmsg) {
  log("==============================================");
  log("To App: " + logmsg);
  log("==============================================");
  if (!logSubscription || ! logmsg) {
    return;
  }
  var f = logSubscription.get();
  f.result = { msg: logmsg };
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

var fresult = {};
var initialize = function(params) {
  var future = new Future(), innerFuture = new Future(fresult), initFinishCheck;
  log("initialize helper, status: " + JSON.stringify(fresult));
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
      fresult = f.result;
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
        f.then(this, initFinishCheck);
        
        if (f.result.keymanager && !f.result.accounts && params.accounts) {
          initAccounts(innerFuture);
        }
      }
    }
  };
  
  //get devide id:
  if (params.devID && !fresult.devID) {
    if (!DeviceProperties.devID) {
      var future_ = PalmCall.call('palm://com.palm.preferences/systemProperties', "Get", {"key": "com.palm.properties.nduid" });
      future_.then(function (f) {
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
      future_.onError(function (f) {
        log("Error in getDeviceID-future: " + f.exeption);
        logToApp("Could not get device id: " + JSON.stringify(f.exeption));
        future_.result = { returnValue: false };
      });
    } else {
      log("DeviceID still present");
      var res = innerFuture.result;
      res.devID = true;
      innerFuture.result = res;
    }
  }
  
  if (params.keymanager && !fresult.keymanager) {
    KeyManager.initialize(innerFuture);
  }
  
  innerFuture.then(this, initFinishCheck);
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

//own AjaxCall, because it is broken in webOS 2.2.4
var AjaxCallPost = function (method, url, body, options) {
  return new Future().now(this, function(future) {
    options = options || {};
    // console.log("Options: " + JSON.stringify(options));
    method = method.toUpperCase();
    
    if (body && method !== AjaxCall.RequestMethod.POST)
    {
      if (url.match("\\?")) {
        url = url + "&" + body;
      } else {
        url = url + "?" + body;
      }
      body = undefined;
    }
    
    if (options.customRequest) {
      method = options.customRequest;
      method = method.toUpperCase();
    }
    //console.log("method = " + method);
    
    
    /*
     * First we set up the http client.
     */
    var parsed = urlModule.parse(url);
    var secure = (parsed.protocol === 'https:');
    var port = parsed.port;
    if (!port) {
      port = (secure) ? 443 : 80;
    }
    
    // console.log("SECURE="+secure);
    // console.log("parsed = "+JSON.stringify(parsed));
    var httpClient = httpModule.createClient(port, parsed.hostname, secure);
    httpClient.addListener('error', function clientError(error) {
      future.exception = Err.create(error.errno, "httpClient error "+error.message);
    });
    
    
    /*
     * Then we set up the http request.
     */
    var headers = {};
    // Add all the generic headers that are always needed
    headers.host = parsed.host;
    // TODO: add support for deflate and gzip encodings, and handle 'nocompression' option
    headers["Accept-Encoding"] = "identity";// "deflate, gzip";
    var bodyEncoding = (options.bodyEncoding === "ascii" ? "ascii" : "utf8");
    if (bodyEncoding === 'ascii') {
      headers["Content-Length"] = (body && body.length) || 0;
    } else {
      headers["Content-Length"] = (body && bufferModule.Buffer.byteLength(body)) || 0;
    }
    headers.Accept = "*/*";
    headers['Content-Type'] = "application/x-www-form-urlencoded";
    headers.Date = (new Date()).toUTCString();
    
    // TODO: Add "expect 100" support for large POST operations?
    
    // Allow the caller to set/override any headers they want
    Object.keys(options.headers || {}).forEach(function (headerName) {
      headers[headerName] = options.headers[headerName];
    });
    // console.log("Headers: " + JSON.stringify(headers));
    
    if (options.joinableHeaders) {
      for (var i = 0; i < options.joinableHeaders.length; ++i) {
        httpClient.palm_markHeaderJoinable(options.joinableHeaders[i]);
      }
    }
    
    // console.log("pathname=" + parsed.pathname);
    var requestPath = parsed.pathname || "/";
    if (parsed.search) {
      requestPath = requestPath + parsed.search;
    }
    
    var local_result = { responseText: "" };
    // console.log("requesting path: " + requestPath);
    var request = httpClient.request(method, requestPath, headers);
    request.addListener('error', function requestError(error) {
      future.exception = Err.create(error.errno, "httpRequest error "+error.message);
    });
    
    /*
     * Set up the response handler for the request.
     */
    request.addListener('response', function returnResponse(response) {
      // console.log("Response headers: " + JSON.stringify(response.headers));
      
      /*
       * Handle the data we have now - the status code and the headers
       */
      future._response = response;
      local_result.status = response.statusCode;
      local_result.getResponseHeader = function(name) {
        return response.headers[name.toLowerCase()];
      };
      local_result.getAllResponseHeaders = function(name) {
        if (!local_result.allHeaders) {
          // Concat all the headers together as a string if they
          // haven't already been
          var headers = [];
          for (var key in response.headers) {
            if (response.headers.hasOwnProperty(key)) {
              headers.push("" + key + ": " + response.headers[key]);
            }
          }
          local_result.allHeaders = headers.join('\r\n');
        }
        return local_result.allHeaders;
      };
      //if the caller passed an onResponse function, call it with the status code and response headers
      if (options.onResponse && typeof options.onResponse === "function") {
        options.onResponse(response.statusCode, response.headers);
      }
      
      
      /*
       * Add handlers for the "data", "error", and "end" events
       */
      response.addListener('data', function addToResponseText(chunk) {
        local_result.responseText += chunk;
        
        //if the caller passed an onData function, call it with the current chunk of data
        if (options.onData && typeof options.onData === "function") {
          options.onData(chunk);
        }
      });
      
      response.addListener('error', function responseError(error) {
        future.exception = Err.create(error.errno, "httpResponse error " + error.message);
      });
      
      response.addListener('end', function requestDone() {
        try {
          local_result.responseJSON = JSON.parse(local_result.responseText);
        } catch (parseError) {
          //ignore errors while parsing the response as JSON - it must not be a JSON response
        }
        future.result = local_result;
      });
    });
    
    // console.log("Body (" + bodyEncoding + ", " + headers["Content-Length"] + "): " + body);
    request.end(body, bodyEncoding);
  });
};
