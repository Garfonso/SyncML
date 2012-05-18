function AppAssistant(appController) {
  Mojo.Log.info("--> AppAssistant Constructor");
  Mojo.Log.info("<-- AppAssistant Constructor");
}

AppAssistant.prototype.setup = function() {
  Mojo.Log.info("Enter AppAssistant.prototype.setup");
  Mojo.Log.info("Exit AppAssistant.prototype.setup");
};

AppAssistant.prototype.handleLaunch = function(launchParams) {
  Mojo.Log.info("--> AppAssistant.prototype.handleLaunch");
  log("LaunchParams: " + JSON.stringify(launchParams));
  Mojo.Log.info("<-- AppAssistant.prototype.handleLaunch");
};
