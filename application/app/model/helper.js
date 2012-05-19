var log = function (logmsg) {
  Mojo.Log.error(logmsg);
};

//global accounts container:
var accounts = [];
var currentAccount = -1;

try {
  var libraries = MojoLoader.require({name: "foundations", version: "1.0"});
  var Foundations = libraries.foundations;
  var Future = libraries.foundations.Control.Future; // Futures library
  var PalmCall = libraries.foundations.Comms.PalmCall;

  Mojo.Log.info("--------->Loaded Libraries OK");
} catch (Error) {
  Mojo.Log.error(Error);
}

//simple logging - requires target HTML element with id of "targOutput"
var logGUI = function (controller, logInfo) {
  Mojo.Log.error(logInfo);
  logInfo = "" + logInfo;
  logInfo = logInfo.replace(/</g, "&lt;");
  logInfo = logInfo.replace(/>/g, "&gt;");
  this.targOutput = controller.get("logOutput");
  this.targOutput.innerHTML = logInfo + "<br/>" + this.targOutput.innerHTML;
};

//simple logging - requires target HTML element with id of "targOutput"
var logStatus = function (controller, logInfo) {
  if (controller && logInfo) {
    Mojo.Log.error("Sync Status " + logInfo);
    logInfo = "" + logInfo;
    logInfo = logInfo.replace(/</g, "&lt;");
    logInfo = logInfo.replace(/>/g, "&gt;");
    this.targOutput = controller.get("logStatus");
    this.targOutput.innerHTML = logInfo + "<br /><hr />";
  }
};
