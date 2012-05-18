//JSLint options:
/*global AjaxCall, console, Base64, log */
//***************************************************
//Validate contact username/password 
//***************************************************
var checkCredentialsAssistant = function (future) {};

checkCredentialsAssistant.prototype.run = function (outerFuture) { 
  log("CheckCredentialsAssistant start");
  var args = this.controller.args;
  log("Args: " + JSON.stringify(args));

  if (locked === true) {
    log("Locked... already running?");
    outerFuture.result = { returnValue: false, notStarted: true };
    return;
  }
  
  if (!args.username || !args.password || !args.url) {
    log("Need username, password and url to check credentials!");
    outerFuture.result = { returnValue: false, notStarted: true };
    return;
  }
  
  try {
    if (outerFuture) {
      log ("outerFuture result: " + JSON.stringify(outerFuture.result));
    }
    locked = true;
    var f = initialize({devID: true});
    f.then(this, function (f2) {
      log("f2: " + f2);
      if (f2.result.returnValue === true) {
        log("f2.result: " + JSON.stringify(f2.result));
        
        log("Starting checkCredentials - 1");
        log("Parameters: " + JSON.stringify(args));
        if (outerFuture) {
          log("outerFuture result: " + JSON.stringify(outerFuture.result));
        }
        
        log("Starting...");
        var account = {username: args.username, password: args.password, url: args.url};
        SyncML.initialize(account);
        log("SyncML initialized.");
        log("=== Trying to call checkCredentials.");
        
        checkCredCallback = function (result) { 
          log("CheckCredentials came back.");
          log("result: " + (result ? result.success : "failure?"));
          //log(JSON.stringify(result));
          if (result.success === true) {
            //config will be passed to onCreate.
            outerFuture.result = { returnValue: true, success: true, "credentials": {"common": {"password": args.password, "username": args.username}},
                "config": {"password": args.password, "username": args.username, "url": args.url}};
          } else {
            outerFuture.result = { returnValue: false, success: false };
          }
          locked = false; 
        }.bind(this);
        
        //eventCallbacks.getAllEvents(checkCredCallback);
        SyncML.checkCredentials(checkCredCallback);
      } else {
        log("Initialization failed... :(");
        locked = false;
        outerFuture.result = { returnValue: false, notStarted: true };
      }
      //return outerFuture;
    });
  } catch (e) { 
    log("Error: " + e.name + " what: " + e.message + " - " + e.stack); 
    locked = false; 
  }
};
