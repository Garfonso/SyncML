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

function email() {

  var request = new Mojo.Service.Request("palm://com.palm.applicationManager",
  {
    method: 'open',
    parameters:
    {
      id: 'com.palm.app.email',
      params:
      {
        'summary':  "SyncML Log",
        'text':   '<html><body>Please add some error description here... :)</body></html>',
        "attachments":[
                       { "fullPath":"/media/internal/.info.mobo.syncml.log",
                          "displayName":"SyncML Log",
                          "mimeType":"application/text"
                       }]
      }
    }
  });
  return request;
}

//setup menu with email log:
AppAssistant.prototype.MenuModel = { visible: true, items: [ {label: $L("E-Mail Log"), command: "do-log-email" }] };

AppAssistant.prototype.handleCommand = function(event) {   
  var stageController = this.controller.getActiveStageController();   
  if(stageController && event.type == Mojo.Event.command) {   
    var currentScene = stageController.activeScene();   
    switch(event.command) {   
    case 'do-log-email':   
      email();   
      break;   
    case 'do-clear-log':   
      currentScene.showAlertDialog({   
        onChoose: function(value) {},   
        title: $L("Not implemented"),   
        message: $L("This is not implemented, yet. :( Please use USB Mode or Internalz Pro or similar to delete /media/internal/.info.mobo.syncml.log"),   
        choices:[{label:$L("OK"), value:""}]   
      }); 
      break;   
    }   
  }   
}; 