//simple logging 
var log = function(logInfo) {
	Mojo.Log.error(logInfo);
};

//creates a ServiceAssistant of type ServiceAssistantBuilder
//this is defined in mojoservice.transport and mainly supplies a "runCommand" method.
//most probably this method will be called from the framework...?
var ServiceAssistant = Transport.ServiceAssistantBuilder({ //we are just calling the constructor with a "config" object, which we build up here.
	clientId: "accountId", //this will be read by ServiceAsssistant constructor. 
						   //not sure now, how that is really used or translated into something useful..
	
	
	setup: function(service,accountId,config,args) //this will initialize the service. 
					  //parameters: "this",accountId,command.config (??),command.args
	{
		log("ServiceAssitant::Setup called with ");
		log("Service = "  + JSON.stringify(service));
		log("accountId = " + JSON.stringify(accoundId));
		log("config = " + JSON.stringify(config));
		log("args = " + JSON.stringify(args));

		var futureAccount = PalmCall.call("palm://com.palm.service.accounts/","getAccountInfo", { accountId: id });
		
		log("1-futureAccount: " + JSON.stringify(futureAccount));
		log("1-futureAccount.result: " + JSON.stringify(futureAccount.result));
		
		futureAccount.then(this,function(future){
			this.account = future.result;
			log("2-futureAccount: " + JSON.stringify(future));
			log("2-futureAccount.result: " + JSON.stringify(future.result));

			
			//get credentials. I'm still not sure, what the "future" is doing here..
			var futureCredentials = PalmCall.call("palm://com.palm.service.accounts/", "readCredentials", {
                         accountId: id, name: "common"});
			log("1-futureCredentials: " + JSON.stringify(futureCredentials));
			log("1-futureCredentials.result: " + JSON.stringify(futureCredentials.result));
			
			futureCredentials.then(this,function(future) {
				log("2-futureCredentials: " + JSON.stringify(future));
				log("2-futureCredentials.result: " + JSON.stringify(future.result));
				this.cred = future.result;
			});
		});
	}							
});