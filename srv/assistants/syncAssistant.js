var syncAssistant = function (future) {};

syncAssistant.prototype.run = function (outerFuture) {
  log("============== syncAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(outerFuture.result));
  outerFuture.result = {returnValue: false};
  return;

  log("SyncAssistant");
  var args = this.controller.args;
  log("Args: " + JSON.stringify(args));

  if (locked === true) {
    log("Locked... already running?");
    future.result = { returnValue: false, notStarted: true };
    return;
  }
  
  if (!args.username || !args.password || !args.url) {
    log("Need username, password and url to check credentials!");
    future.result = { returnValue: false, notStarted: true };
    return;
  }
  
  try {
    if (future) {
      log ("Future result: " + JSON.stringify(future.result));
    }
    locked = true;
    var f = initialize({devID: true, keymanager: true, accounts: true, accountsInfo: true, iCal: true});
    f.then(this, function (f2) {
      log("f2: " + f2);
      if (f2.result.returnValue === true) {
        log("f2.result: " + JSON.stringify(f2.result));
        
        log("Starting checkCredentials - 1");
        log("Parameters: " + JSON.stringify(args));
        if (future) {
          log("Future result: " + JSON.stringify(future.result));
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
            future.result = { returnValue: true, success: true, "credentials": {"common": {"password": args.password, "username": args.username}},
                "config": {"password": args.password, "username": args.username, "url": args.url}};
          } else {
            future.result = { returnValue: false, success: false };
          }
          locked = false; 
        }.bind(this);
        
        //eventCallbacks.getAllEvents(checkCredCallback);
        SyncML.checkCredentials(checkCredCallback);
      } else {
        log("Initialization failed... :(");
        locked = false;
        future.result = { returnValue: false, notStarted: true };
      }
      //return future;
    });
  } catch (e) { 
    log("Error: " + e.name + " what: " + e.message + " - " + e.stack); 
    locked = false; 
  }
};
