var onCredentialsChangedAssistant = function (future) {};

onCredentialsChangedAssistant.prototype.run = function (outerFuture) {
  log("============== onCredentialsChangedAssistant");
  log("Params: " + JSON.stringify(this.controller.args)); //may contain password.
  log("Future: " + JSON.stringify(outerFuture.result));
  
//  if (locked === true) {
//    log("Locked... already running?");
//    previousOperationFuture.then(this, function (f) {
//      log("PreviousOperation finished " + JSON.stringify(f.result) + " , starting onCredentialsChangedAssistant");
//      this.run(outerFuture);
//    });
//    return;
//  }
  
  //this assistant is not helpfull.. it only get's the accountId, but no new credentials??? Why??? :(
  finishAssistant_global({name: "onCredentialsChangedAssistant", outerFuture: outerFuture, result: { returnValue: false, success: false }});
};
