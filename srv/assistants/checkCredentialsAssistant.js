//JSLint options:
/*global AjaxCall, console, Base64, log */
//***************************************************
//Validate contact username/password 
//***************************************************
var checkCredentialsAssistant = function (future) {};

checkCredentialsAssistant.prototype.run = function (outerFuture) {
  var args, checkCredCallback, f, initCallback, account, finishAssistant, logError;
  try {
    outerFutures.push(outerFuture);
    finishAssistant = function (result) {
      finishAssistant_global({name: "checkCredentialsAssistant", outerFuture: outerFuture, result: result});
    };
    logError = function(e) {
      logError_global(e, "checkCredentialsAssistant");
      finishAssistant({returnVaule: false, success: false});
    };
    log("========== CheckCredentialsAssistant start");
    args = this.controller.args;
    //log("Args: " + JSON.stringify(args));
    log("Checking username " + args.username + " on " + args.url);
    
    if (!startAssistant({name: "checkCredentials", outerFuture: outerFuture, run: this.run.bind(this) })){
      return;
    }
    
    if (!args.username || !args.password || !args.url) {
      log("Need username, password and url to check credentials!");
      finishAssistant({ returnValue: false, success: false });
      return;
    }
    
    //callback that returns to application.
    checkCredCallback = function (result) { 
      try {
        log("CheckCredentials came back.");
        log("result: " + (result ? result.success : "failure?"));
        //log(JSON.stringify(result));
        if (result.success === true) {
          //config will be passed to onCreate.
          finishAssistant({ returnValue: true, success: true, "credentials": {"common": {"password": args.password, "username": args.username}},
            "config": {"password": args.password, "username": args.username, "url": args.url}}, "checkCredentials");
        } else {
          log("Wrong credentials");
          finishAssistant({ returnValue: false, success: false });
        }
      } catch (e) {
        logError(e);
      }
    }.bind(this);
    
    //callback after initialization. Main work is done here.
    initCallback = function (f2) {
      try {
        log("f2: " + f2);
        if (f2.result.returnValue === true) {
          log("f2.result: " + JSON.stringify(f2.result));
          
          log("Starting checkCredentials - 1");
          if (outerFuture) {
            log("outerFuture result: " + JSON.stringify(outerFuture.result));
          }
          
          log("Starting...");
          account = {username: args.username, password: args.password, url: args.url};
          SyncML.initialize(account);
          log("SyncML initialized.");
          log("=== Trying to call checkCredentials.");
          
          //eventCallbacks.getAllEvents(checkCredCallback);
          SyncML.checkCredentials(checkCredCallback);
        } else {
          logError({name: "Error", message: "Intialization of framework failed."});
        }
      } catch (e) { 
        logError(e);
      }
    }; 
    if (outerFuture) {
      log ("outerFuture result: " + JSON.stringify(outerFuture.result));
    }
    f = initialize({devID: true});
    f.then(this, initCallback);
  } catch (e) { 
    logError(e);
  }
};
