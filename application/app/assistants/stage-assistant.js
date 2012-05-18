function StageAssistant() {
	/* this is the creator function for your stage assistant object */
}

StageAssistant.prototype.setup = function (params) {
  log("StageAssistant.");
  this.controller.pushScene({name: "welcome"});
};
