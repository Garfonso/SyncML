try {
     var libraries = MojoLoader.require({name: "foundations", version: "1.0"});
     var Foundations = libraries.foundations;
	 var Future = libraries["foundations"].Control.Future; // Futures library
     var DB = libraries["foundations"].Data.DB;  // db8 wrapper library
     var PalmCall = libraries["foundations"].Comms.PalmCall;
	 var CALENDARIO=MojoLoader.require({name: "calendar.io", version: "1.0"})["calendar.io"].IO;
	 
	 Mojo.Log.error("CalendarIO: " + JSON.stringify(CALENDARIO));
	 
     Mojo.Log.info("--------->Loaded Libraries OK");
   } catch (Error) {
   Mojo.Log.error(Error);
}

var log = function(logmsg)
{
	Mojo.Log.error(logmsg);
}

/** Determine whether an object is an array.
         @param  a  (object) the object to test
         @return  (boolean) true if it is an array, or false if not */
var isArray = function(a){
	return (a && a.constructor === Array);
}

//simple logging - requires target HTML element with id of "targOutput"
var logGUI = function(controller, logInfo) {
	Mojo.Log.error(logInfo);
	this.targOutput = controller.get("logOutput");
	this.targOutput.innerHTML =  logInfo + "<br/>" + this.targOutput.innerHTML;
};