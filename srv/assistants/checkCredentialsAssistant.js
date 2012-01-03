//***************************************************
// Validate contact username/password 
//***************************************************
var checkCredentialsAssistant = function(future) {};


checkCredentialsAssistant.prototype.run = function(future) {  

     var args = this.controller.args;  
     console.log("Test Service: checkCredentials args =" + JSON.stringify(args));

     //...Base64 encode our entered username and password
     var base64Auth = "Basic " + Base64.encode(args.username + ":" + args.password);

     //...Request contacts, which requires a username and password
     //...Ask for contacts updated in last second or so to minimize network traffic
     var syncURL = "http://www.plaxo.com/pdata/contacts?updatedSince=" + calcSyncDateTime();

     //...If request fails, the user is not valid
     AjaxCall.get(syncURL, {headers: {"Authorization":base64Auth, "Connection": "keep-alive"}}).then ( function(f2)
     {
        if (f2.result.status == 200 ) // 200 = Success
        {    
            //...Pass back credentials and config (username/password); config is passed to onCreate where
            //...we will save username/password in encrypted storage
            future.result = {returnValue: true, "credentials": {"common":{ "password" : args.password, "username":args.username}},
                                                "config": { "password" : args.password, "username":args.username} };
        }
        else   {
           future.result = {returnValue: false};
        }
     });    
};
