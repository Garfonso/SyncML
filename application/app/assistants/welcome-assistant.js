function WelcomeAssistant() {
	/* this is the creator function for your scene assistant object. It will be passed all the 
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
}

function getDeviceId(callback){
  if (DeviceProperties.devId === undefined) {
    log("Need to get device id!");
    this.controller
        .serviceRequest(
            'palm://com.palm.preferences/systemProperties',
            {
              method : "Get",
              parameters : {
                "key" : "com.palm.properties.nduid"
              },
              //TODO: what about failure??
              onSuccess : function(response) {
                DeviceProperties.devId = response["com.palm.properties.nduid"];
                log("Got deviceId: "
                    + DeviceProperties.devId);
              }.bind(this)
            });
    return false; //tell caller that we need to get device id and we will call calback. 
  }
  else
  {
    return true; //tell caller that we don't get device id, because we already have and he can carry on.
  }
};

WelcomeAssistant.prototype.setup = function() {
	/* this function is for setup tasks that have to happen when the scene is first created */
		
	/* use Mojo.View.render to render view templates and add them to the scene, if needed */
	
  log("Account: " + JSON.stringify(account));
  
	account.controller = this.controller;
	account.readFromConfig();
	
	/* setup widgets here */
	this.controller.setupWidget("btnConfig",{},{label: $L("Configure")});
	this.controller.setupWidget("btnStartSync",{},{label: $L("Start sync")});
	
	/* add event handlers to listen to events from widgets */
	Mojo.Event.listen(this.controller.get("btnConfig"),Mojo.Event.tap,this.pushConfig.bind(this));
	Mojo.Event.listen(this.controller.get("btnStartSync"),Mojo.Event.tap,this.startSync.bind(this));
};

WelcomeAssistant.prototype.pushConfig = function(event) {
	this.controller.stageController.pushScene("configSyncMLAccount");
};

WelcomeAssistant.prototype.startSync = function(event) {
	this.controller.stageController.pushScene("syncScene");
};

WelcomeAssistant.prototype.activate = function(event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
};

WelcomeAssistant.prototype.deactivate = function(event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
	  //saveConfig();
};

WelcomeAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};
