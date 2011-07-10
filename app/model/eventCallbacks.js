var eventCallbacks = (function () {
	//will return public interface:
	return {	
		//framework:
		//should allow the use of 
	    //              IO.eventToVCalendar = function (events)
		//              IO.parseVCalendarToEvent = function (item, options, calendarId)	
	    //variables:
		changedEvents: {
			received: false,
			callDeletedItems: false,
			changed: [],
			changedIds: [],
			delted: [],
			deletedIds: []
		},
		
		receivedEventIDs: false,
		allEventIDs: [],		

		eventUpdated: 0,
		eventUpdateFailed: 0,
		eventAdded: 0,
		eventAddFailed: 0,
		eventDeleted: 0,
		eventDeleteFailed: 0,
				
		createEvent: function(event){
			setTimeout(this.createEventReal.bind(this,event),100);
		},
				
		/**
		 * Creates event, called from c++ part. Parameter is the iCal item data string.
		 * @param {Object} event
		 */
		createEventReal: function(event){
			try {
				var e = iCal.parseEvent(event); //iCal.parseICalToEvent(event);
				e[0]._kind = "info.mobo.syncml.calendarevent:1";
				//log("Got Event: " + JSON.stringify(e[0]));
				var objs = e; //e is already an array. :)
				this.controller.serviceRequest('palm://com.palm.db/', {
					method: 'put',
					parameters: { 
						"objects": objs
						//hopfully set by parseVCalendarToEvent. calendarId: account.webOsCalendarId, 
						//remember correct rev value trackChange: false, //because we are currently syncing..
						//in objs event: e
					},
					onSuccess: function(r){
						this.eventAdded++;
						this.eventsAddedElement.innerHTML = this.eventAdded;
						log("result: " + JSON.stringify(r));
						cPlugin.sendSingle(r.results[0].id, false);
					}.bind(this),
					onFailure: function(error){
						this.eventAddFailed++;
						this.eventsAddFailedElement.innerHTML = this.eventAddFailed;
						try {
							log("Callback not successfull: " + JSON.stringify(error) + ". at - " + event + " = " + JSON.stringify(objs));
							//log("rrule: " + e.rrule);
							//<log("rruleTZ: " + e.rruleTZ);
						} 
						catch (exception) {
						}
						cPlugin.forceReceive();
					}.bind(this)
				});
			}
			catch(exception)
			{
				log("Exception in createEvent: " + exception + " - " + event);//+ JSON.stringify(exception));
				cPlugin.forceReceive();
			}
		},
		
		
		updateEvent: function(event, eventId){
			setTimeout(this.updateEventReal.bind(this,event,eventId),100);
		},
		
		
		/**
		 * Updates an event. Parameters are the iCal item data string and the eventId.
		 * Called from c++.
		 * @param {Object} event
		 * @param {Object} eventId
		 */
		updateEventReal: function(event, eventId){
			try {
				var e = iCal.parseEvent(event); //iCal.parseICalToEvent(event);
				e[0]._id = eventId; //is the eventId identical to the db id?? Hopefully..
				e[0]._kind = "info.mobo.syncml.calendarevent:1";
				var objs = e; //e is already an array. :)
				this.controller.serviceRequest('palm://com.palm.db/', {
					method: 'merge',
					parameters: {
						"objects": objs
					},
					onSuccess: function(r){
						this.eventUpdated++;
						this.eventsUpdatedElement.innerHTML = this.eventUpdated;
						cPlugin.sendSingle(r.returnValue, false);
					}.bind(this),
					onFailure: function(error){
						this.eventUpdateFailed++;
						this.eventsUpdateFailedElement.innerHTML = this.eventUpdateFailed;
						log("Callback not successfull: " + error.errorText + "(" + error.errorCode + "). :(" + event + JSON.stringify(e));
						cPlugin.forceReceive();
					}.bind(this)
				});
			}
			catch(exception)
			{
				log("Exception in UpdateEvent: " + exception + " - " + JSON.stringify(exception) + " at " + event + " with ID " + eventId);
				cPlugin.forceReceive();
			}
		},
		
		/**
		 * Deteles event with eventId. Called from c++.
		 * @param {Object} eventid
		 */
		deleteEvent: function(eventid){
			try
			{
				var ids = [eventid];
                this.controller.serviceRequest('palm://com.palm.db/', {
                    method: 'del',
                    parameters: {
                        //calendarId: account.webOsCalendarId, not necessary, ID is globally unique (??)
                        //trackChange: false, //because we are currently syncing.. do that with saving the correct rev.
                        //eventId: eventid
						"ids": ids
                    },
                    onSuccess: function(r){
                        this.eventDeleted++;
                        this.eventsDeletedElement.innerHTML = this.eventDeleted;
                        cPlugin.sendSingle(r.returnValue, false);
                    }.bind(this),
                    onFailure: function(error){
                        this.eventDeleteFailed++;
                        this.eventsDeleteFailedElement.innerHTML = this.eventDeleteFailed;
                        log("Callback not successfull: " + error.errorText + "(" + error.errorCode + " for eventId: " + eventid + "). :(");
                        cPlugin.forceReceive();
                    }.bind(this)
                });
			}
			catch(exception)
			{
				log("Exception in DeleteEvent: " + exception + " - " + JSON.stringify(exception));
				cPlugin.forceReceive();
			}
		},
		
		getAllEventIds: function(callOnSuccess)
		{
			if(this.receivedEventIDs === true)
			{
				callOnSuccess(this.allEventIDs);
				return;
			}
					
			try{
				log("Getting all event ids.");
				this.controller.serviceRequest('palm://com.palm.db/', {
					method: 'find',
					parameters: {
						"query": {"from":"info.mobo.syncml.calendarevent:1","select":["_id"]}
					},
					onSuccess: function(r) {
						this.allEventIds = r.results;
						callOnSuccess(r.results);
					}.bind(this),
					onFailure: function(error) {
						log("Error in getAllEventIds: " + error.errorText + "( " + error.errorCode + ") = " + JSON.stringify(error));
						cPlugin.forceReceive();
					}.bind(this)
				});
			}
			catch(exception)
			{
				log("Exception in getAllEventIds: " + exception + " - " + JSON.stringify(exception));
				cPlugin.forceReceive();
			}
		},
		
		
		
		/**
		 * Lists events. Returns 10 events at a time. The itemOffset
		 * can be used to get the next 10 events. Be careful: if events are deleted,
		 * they must be substracted from offset, i.e. if all events are deleted, this is
		 * called with offset 0 every time.
		 * @param {Object} itemOffset
		 */
		listEvents: function(itemOffset){
			try {
				log("List events from " + itemOffset);	
				var processEvents = function(itemOffset,eventIds){
					//log("Got Event Ids: " + eventIds + " - " + JSON.stringify(eventIds));
					var itemOffsetNum = new Number(itemOffset);
					//log("Offset: " + itemOffset);
					var ids = [];
					var i = itemOffsetNum;
					var end = itemOffsetNum;
					end = end + 10;
					for(; i < eventIds.length && i < end; i++)
					{
						//log(i + "," + eventIds.length + "," +  end + ", " + itemOffsetNum+10 + "," + itemOffset);
						//log("EventID Obj: " + JSON.stringify(eventIds[i]));
						ids.push(eventIds[i]._id);
					}
					var events = [];
					if (ids.length > 0) {
						log("Build IDs array with " + ids.length + " entries.");
						this.getEvent(0, ids, events);
					}
					else
					{
						log("No more events.");
						cPlugin.sendLoop([]); //end event loop.
					}				
				}.bind(this,itemOffset);
			
				this.getAllEventIds(processEvents);
			}
			catch(exception)
			{
				log("Exception in ListEvents: " + exception + " - " + JSON.stringify(exception));
				cPlugin.forceReceive();
			}
		},
		
		/**
		 * This is a shortcut to delete all events. This "simply" deletes
		 * the calendar, which in turn lets webOs delete all events. This is
		 * much faster than deleting all events manually.
		 * Creates a new calendar afterwards.
		 * 
		 * changed this to delete all events and not the whole calendar.
		 *       Deleting the whole calendar will remove the calendar from being the 
		 *       default one, if user set it this way.. we don't want that. :(
		 */
		deleteAllEvents: function(){
			try {
				log("Deleting all events: ");
				var processArray = function(eventIds)
				{
					//log("Got eventIds: " + eventIds + " - " + JSON.stringify(eventIds));
					var i;
					for(i = 0; i < eventIds.length; i++)
					{
						//log("Deleteing event " + eventIds[i]);
						this.deleteEvent(eventIds[i]._id);
					}
					
					if(eventIds.length == 0)
					{
						//had no events. Wake Up C++!
						cPlugin.forceReceive();
					}
				}.bind(this);
				
				this.getAllEventIds(processArray);
			}
			catch(exception)
			{
				log("Exception in deleteAllEvents: " + exception + " - " + JSON.stringify(exception));
				cPlugin.forceReceive();
			}
		},
		
		getDeletedEvent: function(){
			try {
				if (!this.changedEvents.received) {
					cPlugin.forceReceive();
				}
				else {
					if (this.changedEvents.deletedIds.length > 0) {
						cPlugin.forceReceive(this.changedEvents.deletedIds[0]);
						log("Send id: " + this.changedEvents.deletedIds[0]);
						this.changedEvents.deletedIds.splice(0, 1);
					}
					else {
						cPlugin.forceReceive("finished");
					}
				}
			}
			catch(exception)
			{
				log("Exception in getDeletedEvent: " + exception + " - " + JSON.stringify(exception));
				cPlugin.forceReceive();
			}
		},
		
		getEventChanges: function(){
			try {
				if (this.changedEvents.received) {
					cPlugin.forceReceive();
					return;
				}
				else {
					log("Get changes.");
					this.controller.serviceRequest('palm://com.palm.db/', {
						method: 'find',
						parameters: {
							"query": {"from":"info.mobo.syncml.calendarevent:1",
							          "select":["_id"],
									  "where":[{"prop":"_rev", "op":">", "val":account.webOsCalendarRev}],
									  "incDel":true
									  }
						},
						onSuccess: function(r){
							log("Got changes: " + JSON.stringify(r));
							if (r.results.length === 0) {
								cPlugin.forceReceive("0"); //nothing changed or whatsover? Wakeup c++.
							}
							else {
								//have only one calendar, so take 0 allways:
								var i;
								
								this.changedEvents.changed = [];
								this.changedEvents.deleted = [];
								this.changedEvents.received = true;
								
								for(i = 0; i < r.results.length; i++)
								{
									if(r.results[i]._del === true)
									{
										this.deletedEvents.deletedIds.push(r.results[i]._id);
									}
									else
									{
										this.changedEvents.changedIds.push(r.results[i]._id);
									}
								}
																
								if (this.changedEvents.changedIds.length === 0) {
									cPlugin.forceReceive("0");
								}
								else {
									this.getEvent(0, this.changedEvents.changedIds, this.changedEvents.changed);
								}
							}
						}.bind(this),
						onFailure: function(r){
							log("Get changes failed: " + r + " - " + JSON.stringify(r));
							//account.webOsCalendarId = undefined; 
							cPlugin.forceReceive();
						}.bind(this)
					});
				}
			}
			catch(exception)
			{
				log("Exception in getEventChanges: " + exception + " - " + JSON.stringify(exception));
				cPlugin.forceReceive();
			}
		},
		
		getEvent: function(index, ids, array){
			try {				
				this.controller.serviceRequest('palm://com.palm.db/', {
					method: 'find',
					parameters: {
						"query": {"from":"info.mobo.syncml.calendarevent:1",
						          "where":[{"prop":"_id", "op":"=", "val":ids[index]}]
								 }
					},
					onSuccess: function(r){
						//log("GetEvent, result: " + r + " - " + JSON.stringify(r));
						try {
							array.push(r.results[0]);
							if (index + 1 < ids.length) {
								this.getEvent(index + 1, ids, array);
							}
							else {
								cPlugin.sendLoop(array, true);
								ids = [];
								array = [];
							}
						} 
						catch (e) {
							log("Something went wrong in success of getEvent: " + e + " - " + JSON.stringify(e));
							cPlugin.forceReceive();
						}
					}.bind(this),
					onFailure: function(r){
						log("Get event failed: " + r + " - " + JSON.stringify(r));
						cPlugin.forceReceive();
					}.bind(this)
				});
			}
			catch(exception)
			{
				log("Exception in getEvent: " + exception + " - " + JSON.stringify(exception));
				cPlugin.forceReceive();
			}
		},
		
		checkCalendar: function(){
			var query = { "from": "info.mobo.syncml.calendar:1", 
			              "where":[{"prop":"accountId","op":"=","val":account.webOsAccountId}]};
			
			log("Check calendar.");
			if (account.syncCalendar) {
				if (account.webOsCalendarId !== undefined) {
					log("Have Calendar Id: " + account.webOsCalendarId);					
					DB.find(query,false,false).then(function(future)
					{
						var result = future.result;
						var results;
						var i;
						//log("Cal-Search-Result: " + JSON.stringify(result));
				
						if(result.returnValue === true)
						{
							//log("Query ok");
							results = result.results;
							for(i = 0; i < results.length; i++)
							{
								//log("Calendar " + JSON.stringify(results[i]));
								if(results[i]._id === account.webOsCalendarId)
								{
									log("Found calendar, everything ok.. :)");
									return;
								}
							}
							
							//if we reached this point, calendar was not found..
							log("Calendar not found.. :(");
							account.webOsCalendarId = undefined;
							this.checkCalendar();
						}
					});
				}
				else {
					log("Need to create calendar account.");
					
					var calendar = {
						"_kind": "info.mobo.syncml.calendar:1",
						"accountId": account.webOsAccountId,
						"color": "purple",
						"excludeFromAll": false,
						"isReadOnly": false,
						"name": account.name + " Calendar",
						"syncSource": "info.mobo.syncml"
					};
					var obs = [calendar];
					
					DB.put(obs).then(function(future) {
						if(future.result.returnValue === true)
						{
							log("Created calendar: " + JSON.stringify(future.result.results));
							if (future.result.results.length > 0) {
								account.webOsCalendarId = future.result.results[0].id;
								account.saveConfig();
							}
							else
							{
								log("Error: Add returned no ID??");
							}
						}
						else
						{
							log("Could not add calendar: " + future.result.errorCode + " = " + future.result.errorMessage);
						}
					});
				}
			}
		},
		
		startTrackingChanges: function(){
			try {
				log("Tracking changes for future updates.");
				this.controller.serviceRequest('palm://com.palm.db/', {
					method: 'find',
					parameters: {
						"query": {
							"from": "info.mobo.syncml.calendarevent:1",
							"select": ["_rev"]
						}
					},
					onSuccess: function(r){
						var i;
						for (i = 0; i < r.results.length; i++) {
							if (r.results[i]._rev > account.webOsCalendarRev) {
								account.webOsCalendarRev = r.results[i]._rev;
							}
						}
						log("Will sync all changes after rev " + account.webOsCalendarRev);
					}.bind(this),
					onFailure: function(error){
						log("Error in startTrackingchanges: " + error.errorText + "( " + error.errorCode + ") = " + JSON.stringify(error));
					}.bind(this)
				});
			}
			catch(exception)
			{
				log("Exception in startTrackingChanges: " + exception + " - " + JSON.stringify(exception));
			}
		},
		
		finishSync: function(successful){
			try {
				if (successful) {
					this.startTrackingChanges();
				}
				
				if (this.changedEvents.received) {
					this.changedEvents.changed = [];
					this.changedEvents.changedIds = [];
					this.changedEvents.delted = [];
					this.changedEvents.deletedIds = [];
					this.changedEvents.received = false;
				}
				
				this.eventUpdated = 0;
				this.eventUpdateFailed = 0;
				this.eventAdded = 0;
				this.eventAddFailed = 0;
				this.eventDeleted = 0;
				this.eventDeleteFailed = 0;
			}
			catch(exception)
			{
				log("Exception in finishSync: " + exception + " - " + JSON.stringify(exception));
			}
		}

	}; //end of public interface
}()); //selfinvoke function

