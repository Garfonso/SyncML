var onCredentialsChangedAssistant = function (future) {};

onCredentialsChangedAssistant.prototype.run = function (future) {
  log("============== onCredentialsChangedAssistant");
  log("Params: " + JSON.stringify(this.controller.args));
  log("Future: " + JSON.stringify(future.result));
  future.result = {returnValue: false};
};
