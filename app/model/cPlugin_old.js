var cPlugin = function(){
    //the c++ plugin object:
    
    return {	
        thePluginObject: null,
        setup: function(plugin){
            this.thePluginObject = plugin;
            this.thePluginObject.listEvents = eventCallbacks.listEvents.bind(eventCallbacks);
            this.thePluginObject.createEvent = eventCallbacks.createEvent.bind(eventCallbacks);
            this.thePluginObject.updateEvent = eventCallbacks.updateEvent.bind(eventCallbacks);
            this.thePluginObject.deleteEvent = eventCallbacks.deleteEvent.bind(eventCallbacks);
            this.thePluginObject.deleteAllEvents = eventCallbacks.deleteAllEvents.bind(eventCallbacks);
            this.thePluginObject.getEventChanges = eventCallbacks.getEventChanges.bind(eventCallbacks);
            this.thePluginObject.getDeletedEvent = eventCallbacks.getDeletedEvent.bind(eventCallbacks);
        },
        
        /**
         * Used to send small chunks of data towards C++.
         * Can also parse events to iCal automatically.
         * @param {Object} r
         * @param {Object} event
         */
        sendSingle: function(r, event){
            if (!this.thePluginObject) {
                return;
            }
            
            var complete = "";
            if (event) {
                complete = CALENDARIO.eventToVCalendar(r); 
            }
            else {
                complete += r;
            }
            if (complete.length > 250) {
                log("r is to long for a single send: " + complete);
                this.sendLoop([r], event);
                return;
            }
            
            if (r === undefined || r === null || r === "") {
                this.thePluginObject.receiveResult("ok");
            }
            
            var msg = [];
            var command = "this.thePluginObject.receiveResult(msg[0]";
            msg.push(complete);
            if (event) {
                msg.push(r._id);
                command += ",msg[1]";
            }
            command += ");";
            eval(command);
        },
        
        /**
         * This seems complex. But I recognized, that to long strings just get truncated.
         * The maximum stringlength seems to be 255, therefore I chunk the long messages
         * into parts of 250 lenght and assemble them again in C++.
         * First I just added more string parameters in one call, until I recognized that
         * calls with more than 3 or 4 250-char chunks just get lost somewhere, so the callback
         * is called to few times, which is VERY bad.
         * Therefore I changed the strategy and now send each chunk in individual callbacks. I hope
         * that doesn't slow down the method tooo much... on the other hand: synchronizing takes
         * ages anyway, at least not on my development Pixi Plus.
         *
         *  Calling this function without any parameters means that the callback failed. This is
         *  necessary, because C++ will wait for an answer.
         *
         * @param {Object} r = array of
         * @param {Object} events
         */
        sendLoop: function(r, events){
            var i, c;
            if (!isArray(r)) {
                log("R is no array: " + r);
                this.sendSingle(r, events);
                return;
            }
            
            if (r.length === 0) {
                log("Empty loop. Will wake up c++!");
                this.thePluginObject.receiveResultLoop(0, 0);
                return;
            }
            
            for (i = 0; i < r.length; i++) {
                var complete = "";
                if (events) {
                    complete = CALENDARIO.eventToVCalendar(r[i]);
                }
                else {
                    complete += r[i];
                }
                //log("Write Event: " + complete + " is event: " + events);
                var length = complete.length;
                var chunks = Math.ceil(length / 250.0);
                var chunksSend = events ? chunks : chunks - 1;
                var offset = 0;
                
                var msg;
                for (c = 0; c < chunks; c++) {
                    msg = complete.substr(offset, 250);
                    offset += 250;
                    this.thePluginObject.receiveResultLoop(msg, c, chunksSend, i, r.length - 1, events ? 1 : 0);
                }
                
                if (events) {
                    msg = r[i]._id;
					log("Send eventId: " + r[i]._id);
                    this.thePluginObject.receiveResultLoop(msg, chunks, chunksSend, i, r.length - 1, 1);
                }
            }
        },
        
        /**
         * Sometimes sending to c++ fails, because the call back did not return (or whateever).
         * This is a wrapper that tries to cal C++ until it worked, capturing all errors that happen...
         * @param {Object} string
         */
        forceReceive: function(string){
            try {
                if (string !== undefined) {
                    this.thePluginObject.receiveResult(string);
                }
                else {
                    this.thePluginObject.receiveResult();
                }
            } 
            catch (e) {
                log("Error received: " + e + " - " + JSON.stringify(e));
                log("Will call function again, soon.");
                setTimeout(this.forceReceive.bind(this, string), 100);
            }
        }
    };
}();

