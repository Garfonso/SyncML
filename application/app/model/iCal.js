var iCal = function(){
    return {
    	
    	//new, based on 2.0 functions:
		parseEvent: function (event) {
			try
			{
				var i;			
				var lines = event.split('\n');
				var eventNeu = "";
				var skipEntry = false;
				var skip = "";
				for(i = 0; i < lines.length; i++)
				{
					var line = lines[i];
					if(line.indexOf("ATTENDEE") !== -1 ||
					   line.indexOf("ORGANIZER") !== -1)
					{
						//if(line.indexOf(":MAILTO") !== -1) 
						//{
						//	eventNeu += line + '\n';
						//}
						//else //multiline attendee.
						//{
							skipEntry = true;
						//}
					}
					
					if(skipEntry === true)
					{			
						//if(line.indexOf(":MAILTO") === -1) //still no mailto.
						//{
						//	skip += line + '\n';
						//}
						//else //got mailto! :)
						//{
						//	eventNeu += skip + '\n' + line  + '\n';
						//}
						
						if(line.indexOf(":") !== -1) //end of entry.
						{
							skipEntry = false;
							log("Skipping: " + skip + '\n' + line);
							skip = "";
						}
						else
						{
							skip += line + '\n';
						}
						
						continue;
					}
					
					eventNeu += line  + '\n';
				}
				
				log("parseEvent with new event: " + eventNeu);
				return CALENDARIO.parseVCalendarToEvent(eventNeu,{},account.webOsCalendarId);
			}
			catch (exception_cal)
			{
				log("Could not parse iCal to event: " + JSON.stringify(exception_cal));
				log("iCal was: " + event);
				log("Modified to: " + eventNeu);
			}
		},
    	
		makeVCalendar: function(event)
		{
			var e = CALENDARIO.eventToVCalendar(r)[0];
			var lines = e.split('\n');
			
			var result = "";
			for(var line in lines)
			{
				if(line.indexOf("_SYNC:") !== -1 ||
				   line.indexOf("EVENTDISPLAYREVSET:"))
				{
					log("Skipping " + line);
					continue;
				}
				
				result += line + '\n';
			}
		},
		
    	
		//variables:
		//array used to store recurring events, that we need to find exeptions for.
		recurringEvents: [],
		
		/* Pattern for folded lines: start with a whitespace character */
		FOLDED: /^\s(.*)$/,
		/* Pattern for an individual entry: name:value */
		ENTRY: /^([A-Za-z0-9\-]+)((?:;[A-Za-z0-9\-]+=(?:"[^"]+"|[^";:,]+)(?:,(?:"[^"]+"|[^";:,]+))*)*):(.*)$/,
		/* Pattern for an individual parameter: name=value[,value] */
		PARAM: /;([A-Za-z0-9\-]+)=((?:"[^"]+"|[^";:,]+)(?:,(?:"[^"]+"|[^";:,]+))*)/g,
		/* Pattern for an individual parameter value: value | "value" */
		PARAM_VALUE: /,?("[^"]+"|[^";:,]+)/g,
		/* Pattern for a date only field: yyyymmdd */
		DATEONLY: /^(\d{4})(\d\d)(\d\d)$/,
		/* Pattern for a date/time field: yyyymmddThhmmss[Z] */
		DATETIME: /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/,
		/* Pattern for a date/time range field: yyyymmddThhmmss[Z]/yyyymmddThhmmss[Z] */	
		DATETIME_RANGE: /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)\/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/,
		/* Pattern for a duration: [+-]PnnW or [+-]PnnDTnnHnnMnnS */
		//var DURATION = /^([+\-])?P(\d+W)?(\d+D)?(T)?(\d+H)?(\d+M)?(\d+S)?$/;
		/* Reserved names not suitable for attrbiute names. */
		RESERVED_NAMES: ['class'],
    
        /**
         * Determines if a incomming iCal object is an allday event, or not.
         * There is no standarized way in iCal to transmit allday events.
         * @param {Object} startDate
         * @param {Object} endDate
         */
        isAllday: function(startDate, endDate){
            if (startDate.allday !== undefined && startDate.allday) {
                return true;
            }
            var start = this.getTimestamp(startDate) / 1000;
            var end = this.getTimestamp(endDate) / 1000;
            if (start === end) {
                //same value => 0-length events make no sense => allday.
                return true;
            }
            if (start + 86400 >= end && start + 86400 - 60 <= end) {
                //~24hrs between start and end.
                return true;
            }
            return false;
        },
        
        /**
         * Parses the attendees from iCal data.
         * @param {Object} attendees
         * @param {Object} organizer
         */
        getAttendees: function(attendees, organizer){
            var i;
            var res = [];
            if (attendees === null || attendees === undefined) {
                return res;
            }
            if (organizer === null || organizer === undefined) {
                organizer = {
                    cn: ""
                };
            }
            
            for (i = 0; i < attendees.length; i++) {
                var attendee = {
                    name: this.unquoteICAL(attendees[i].cn),
                    email: this.unquoteICAL(attendees[i].email),
                    organizer: (organizer.cn === attendees[i].cn)
                };
                if (attendee.email && attendee.email !== "" && attendee.name && attendee.name !== "") {
                    res[res.length] = attendee;
                }
            }
            return res;
        },
        
        /**
         * Generates an exdate string. webOS wants this string in rrule after a \n.
         * But why are splitting this string apart. So we need to rebuild it...
         * On the other hand this is not soo bad, because we can exclude parts
         * webOs does not support and wants to have in different fields anyway.
         * @param {Object} exdate
         * @param {Object} e
         */
        generateEXDATEString: function(exdate, e){
            var res = "";
            var i;
            res += "EXDATE;";
            if (exdate.tzid !== undefined && exdate.tzid !== null && exdate.tzid !== "") {
                //res += "TZID=" + exdate.tzid;
                e.rruleTZ = exdate.tzid;
            }
            if (exdate.value) {
                res += "VALUE=";
                try {
                    res += exdate.value.getTime();
                } 
                catch (error1) {
                    res += exdate.value;
                }
            }
            
            var value = "";
            try {
                value = this.formatDate(exdate._value);
            } 
            catch (error2) {
                //log("Could not formate " + exdate._value);
                value = exdate._value;
            }
            
            res += ":" + value;
            
            try {
                log("Parsing " + value + " for exeption ts..");
                e.exdateTS = [];
                var dates = value.split(',');
                log("Got: " + JSON.stringify(dates));
                for (i = 0; i < dates.length; i++) {
                    try {
                        var ts = this.checkDate(value).getTime();
                        log("Got ts: " + ts);
                        e.exdateTS.push(ts);
                    } 
                    catch (error3) {
                        log("Expetion during TS generation: " + e + " - " + JSON.stringify(e));
                    }
                }
                log("TS array: " + JSON.stringify(e.exdateTS));
            } 
            catch (error4) {
                log("Expetion during exdate parsing: " + e + " - " + JSON.stringify(e));
            }
            
            return res;
        },
        
        /**
         * Parses the rrule string (for some strange reason the iCal parser won't split that one...)
         * webOs needs the string more or less complete, but we need to undestand it to an extend
         * and snip out some parts webOs doesn't like in there.
         * @param {Object} rrule
         * @param {Object} exdate
         * @param {Object} rdate
         * @param {Object} e
         */
        parseRRULE: function(rrule, exdate, rdate, e){
            var res = "";
            if (rrule !== undefined && rrule !== null) {
                res += "RRULE:";
                var r = rrule;
                if (rrule.indexOf("UNTIL") !== -1) {
                    var start = rrule.indexOf("UNTIL");
                    r = rrule.substr(0, start - 1);
                    var until = rrule.substr(start + 6);
                    try {
                        e.endValidity = this.checkDate(until).getTime();
                    } 
                    catch (error) {
                        log("Could not fill endValidity: " + e + " - " + JSON.stringify(e));
                        log("e: " + JSON.stringify(e));
                        log("RRULE: " + rrule + " until: " + until);
                    }
                }
                res += r;
                res += (exdate ? '\r\n' + this.generateEXDATEString(exdate, e) : '') + (rdate ? '\r\n' + rdate : '');
                e.rrule = res;
            }
        },
        
        /**
         * Quotes forbidden characters in iCal strings.
         * @param {Object} string
         */
        quoteICAL: function(string){
            if (string === undefined || string === null || typeof(string) !== "string") {
                return string;
            }
            string = string.replace(/\\/gi, "\\\\");
            string = string.replace(/,/gi, "\\,");
            string = string.replace(/;/gi, "\\;");
            string = string.replace(/\n/gi, "\\n");
            //string = string.replace(/\N/g,'\\N');
            return string;
        },
        
        /**
         * Unquotes forbidden characters from iCal strings.
         * Most probably this is NOT efficient... hm. :(
         * @param {Object} string
         */
        unquoteICAL: function(string){
            if (string === undefined || string === null || typeof(string) !== "string") {
                return string;
            }
            string = string.replace(/\\\\/gi, '\\');
            string = string.replace(/\\,/gi, ',');
            string = string.replace(/\\;/gi, ';');
            string = string.replace(/\\n/gi, '\n');
            //string = string.replace(/\\N/g,'\n');
            return string;
        },
        
        /**
         * This is needed for the strange parser / iCal structure...
         * If a iCal entry has only the value, it's just a variable (param).
         * But iCal entries can also have parameters with parameter values attached to it.
         * In this case the "value" is stored in a _value field and all other parameter-values
         * are stored in fields corresponding to the param-names.
         * We don't like to check this all the time, so we just call this method from time to time.
         * @param {Object} entry
         */
        unpackValue: function(entry){
            if (entry._value !== undefined) {
                return entry._value;
            }
            else {
                return entry;
            }
        },
        
        /**
         * This is more or less a combination of "getValue" and getTime().
         * @param {Object} entry
         */
        getTimestamp: function(date){
            if (date._utctimestamp) {
                log("Date had my UTC timestamp: " + date + " => " + date._utctimestamp);
                return date._utctimestamp;
            }
            else {
                log("No UTC timestamp set " + JSON.stringify(date) + "... might get into trouble here: " + date + " => " + date.getTime());
                return date.getTime();
            }
        },
        
        /**
         * Parses an iCal Text and returns an webOs calendar object.
         * @param {Object} icaltext
         */
        parseICalToEvent: function(icaltext){
            var i, j;
            try {
                var icalObj = this.parseICal(icaltext);
                var e = icalObj.vevent;
                //"read" timezone id. Timezone id is not allways transmitted. 
                //We suspect time to be in UTC, if no timezone is specified.
                var tzid = "UTC";
                if (icalObj && icalObj.vtimezone && icalObj.vtimezone.tzid) {
                    tzid = icalObj.vtimezone.tzid;
                    log("Got TZID " + tzid + " from vtimezone.");
                }
                else {
                    if (e.dtstart.tzid) {
                        tzid = e.dtstart.tzid;
                        log("Got TZID " + tzid + " from dtstart.");
                    }
                    else 
                        if (e.dtend.tzid) {
                            tzid = e.dtend.tzid;
                            log("Got TZID " + tzid + " from dtend.");
                        }
                }
                
                var event = {
                    tzid: tzid,
                    alarm: "none", //Optional. Duration format is "none" or per standard ISO 8601, Data elements and interchange formats — Information interchange — Representation of dates and times. Use all lowercase.
                    eventId: "", //only set for events that come from mojo.
                    allday: this.isAllday(this.unpackValue(e.dtstart), this.unpackValue(e.dtend)), //Optional. True if an all day event.
                    attendees: this.getAttendees(e.attendee, e.organizer), //Optional. Attendee object.
                    endTimestamp: this.getTimestamp(this.unpackValue(e.dtend)), //Event end time in milliseconds since Unix Epoch (midnight of January 1, 1970 UTC).
                    endValidity: 0, //Optional. For non-recurring events, it is the end timestamp. For recurring events, it is the end timestamp of the last occurrence or 0 if the event repeats forever.
                    externalId: e.uid ? e.uid : '', //Optional. An external reference to this event.
                    location: e.location ? this.unquoteICAL(e.location) : '', //optional location
                    note: (e.description ? this.unquoteICAL(e.description) : '') + (e.categories ? '\n----\n' + e.categories + '\n----\n' : ''), //optional note text, manualy inserted categories if the exist.
                    originalStartTimestamp: 0, //The original start timestamp of this event in the parent series. This is mandatory if specifying a "parentId".
                    parentId: "", //Optional. If this is an exception that needs to be linked to a parent recurring series.
                    rrule: "", //Optional. Recurring string per standard RFC 2445, Internet Calendaring and Scheduling Core Object Specification (iCalendar), and may include only RRULE, EXRULE, RDATE, and EXDATE.
                    rruleTZ: tzid, //Required when specifying an rrule. The value of rruleTZ may be either a string representing a time zone ID (as specified in the Zoneinfo database), or an rruleTimezone object (as specified in the rruleTimezone table below). When creating an event object, you may use whichever format you prefer. When retrieving event objects via the getEvent and listEvents methods, you may specify the format you prefer to receive.
                    subject: e.summary ? this.unquoteICAL(e.summary) : '', //Optional. Title of the event
                    startTimestamp: this.getTimestamp(this.unpackValue(e.dtstart))
                };
                
                //find out if we are recurring and have exeptions..
                this.parseRRULE(e.rrule, e.exdate, e.rdate, event);
                
                if (event.allday) {
					//mojo sends 0:00 - 23:59:59 in local time... but it's not what it wants to have back??
					var startDate = new Date(event.startTimestamp);
					var endDate = new Date(event.endTimestamp);
										
					log("Allday => Start: " + startDate + " End: " + endDate);
					startDate.setHours(0);
					startDate.setMinutes(0);
					
					endDate.setHours(23);
					endDate.setMinutes(59);
					endDate.setSeconds(59);
					
					if(endDate.getDate() != startDate.getDate()) //from RFC ???? whatever the endday is excluded in iCal.
					{
						endDate.setDate(endDate.getDate()-1);
					}
					
					this.utcDate(startDate);
					this.utcDate(endDate);
										
					log("Allday Modified => Start: " + startDate + " End: " + endDate);					
					
					event.endTimestamp = endDate.getTime();
					event.startTimestamp = startDate.getTime();
					
					 //&& event.startTimestamp !== event.endTimestamp
                    //event.endTimestamp -= 1000; //substract a second to prevent multiday allday events to be a day too long.
                }
                
                //parse alarms.
                //as far as I know webOs only supports one alarm and only relative to start. So we will try to find a alarm relative to date and take the first one..
                var alarm = "none";
                if (e.valarm) {
                    if (this.isArray(e.valarm)) {
                        for (i = 0; i < e.valarm.length; i++) {
                            if (e.valarm[i].action !== undefined && e.valarm[i].action !== null && e.valarm[i].action.toLowerCase() === "display") {
                                if (e.valarm[i].trigger.value !== undefined && e.valarm[i].trigger.value !== null && e.valarm[i].trigger.value.toLowerCase() === "duration") {
                                    alarm = e.valarm[i]._value;//can only support one alarm, take the first one.
                                    break;
                                }
                            }
                        }
                    }
                    else {
                        if (e.valarm.action !== undefined && e.valarm.action !== null && e.valarm.action.toLowerCase() === "display" &&
                        e.valarm.trigger.value !== undefined &&
                        e.valarm.trigger.value !== null &&
                        e.valarm.trigger.value.toLowerCase() === "duration") {
                            alarm = e.valarm.trigger._value;
                        }
                    }
                }
                event.alarm = alarm;
                
                //try to fill "parent id" and originaltimestamp for exceptions to recurring dates. 
                if (e.exdate !== undefined && e.exdate !== null && e.exdate !== "") {
                    log("Event has exdate: " + JSON.stringify(e.exdate));
                    this.recurringEvents.push(event);
                }
                else 
                    if (this.recurringEvents.length > 0) {
                        var tscleared = event.startTimestamp - (event.startTimestamp % 86400000);
                        for (i = 0; i < this.recurringEvents.length; i++) {
                            var revent = this.recurringEvents[i];
                            log("Checking if event is exception for " + JSON.stringify(revent));
                            for (j = 0; j < revent.exdateTS.length; j++) {
                                var ts = revent.exdateTS[j];
                                log("Matching TS: " + ts + " = " + event.startTimestamp);
                                if (ts === tscleared) {
                                    event.originalStartTimestamp = revent.startTimestamp;
                                    event.parentId = revent.eventId;
                                    log("Found parent event with eventId " + revent.eventId + " ts: " + ts + " this ts " + event.startTimestamp);
                                    revent.exdateTS.splice(j, 1);
                                    if (revent.exdateTS.length === 0) //no exceptions left, remove event from recurring list.
                                    {
                                        log("All exceptions found for event..");
                                        this.recurringEvents.splice(i, 1);
                                    }
                                    return event;
                                }
                            }
                        }
                    }
                
                return event;
            } 
            catch (exception) {
                log("Could not parse event. Error: " + exception);
				try{
					log(JSON.stringify(exception));
				}
				catch(exception2){ log(exception2 + " - " + JSON.stringify(exception2));}
                log(icaltext);
            }
        },
        
        makeICal: function(event){
            var i;
            var limit75 = function(text){
                var out = '';
                while (text.length > 75) {
                    out += text.substr(0, 75) + '\n';
                    text = ' ' + text.substr(75);
                }
                out += text;
                return out;
            };
            var categories = null;
            var note = event.note;
            if (note && note.indexOf('\n----\n') !== -1) {
                var start = note.indexOf('\n----\n') + 6;
                var end = note.indexOf('\n----\n', start);
                categories = note.substr(start, end - start);
                note = note.substr(0, start - 6);
            }
            
            var astr = (event.attendees.length > 0 ? "" : null);
            var organizer = null;
            for (i = 0; i < event.attendees.length; i++) {
                astr += "ATTENDEE;CN=" + this.quoteICAL(event.attendees[i].name) + ";EMAIL=" + this.quoteICAL(event.attendees[i].email) + ":MAILTO:" + this.quoteICAL(event.attendees[i].email) + "\n";
                if (event.attendees[i].organizer) {
                    organizer = event.attendees[i];
                }
            }
            if (organizer) {
                astr += 'ORGANIZER;CN=' + this.quoteICAL(organizer.name) + ":MAILTO:" + this.quoteICAL(organizer.email) + '\n';
            }
            
            var endTime = this.formatDateTime(new Date(event.endTimestamp));
            var startTime = this.formatDateTime(new Date(event.startTimestamp));
            if (event.allday) {
				//this "should" be 0:00 and 23:59.
                var startDate = new Date(event.startTimestamp);
                var endDate = new Date(event.endTimestamp);
                
                //if (endDate.getDate() != startDate.getDate()) {
                    //we need to add a day to endtimestamp. Because in iCal after RFC 2445 the endtime is exclusive, so allday events would be a day to short here!
                    //Somehow this is done correclty in webOs for one-day-all-day events, but not for multi-day events.
                    endDate.setDate(endDate.getDate()+1);
                //}
                //else //one day allday event: do only formatDate:
                //{
                //endTime = this.formatDatenew Date(event.endTimestamp + minuteOffset));
                //}
				
				/*startDate.setHours(0);
				startDate.setMinutes(0);
				endDate.setHours(23);
				endDate.setMinutes(59);
				endDate.setSeconds(59);*/
				
				endTime = this.formatDate(endDate);
                startTime = this.formatDate(startDate);
				log("Offset: " + startDate.getTimezoneOffset());
                log("Start: " + startTime + " Ende: " + endTime + " original was: " + new Date(event.startTimestamp) + " - " + new Date(event.endTimestamp));
            }
            
            
            //missing: attendees and maybe endValidity..?
            return 'BEGIN:VCALENDAR\n' +
            'VERSION:2.0\n' +
            'PRODID:webOs.icalendar\n' +
            'METHOD:PUBLISH\n' +
            (event.tzid ? 'BEGIN:VTIMEZONE\nTZID:' + event.tzid + '\nEND:VTIMEZONE\n' : '') + //VTIMEZONE is before VEVENT.
            'BEGIN:VEVENT\n' +
            //		(event.eventId ? 'UID:' + event.eventId + '\n' : '') +
            'DTSTART:' +
            startTime +
            '\n' +
            'DTEND:' +
            endTime +
            '\n' +
            (astr ? astr : '') +
            (event.subject ? limit75('SUMMARY:' + this.quoteICAL(event.subject)) + '\n' : '') +
            (note ? limit75('DESCRIPTION:' + this.quoteICAL(note)) + '\n' : '') +
            (event.location ? limit75('LOCATION:' + this.quoteICAL(event.location)) + '\n' : '') +
            (categories ? limit75('CATEGORIES:' + categories) + '\n' : '') +
            (event.rrule ? event.rrule + '\n' : '') + //TODO: rruleTZ?
            (event.alarm !== "none" ? 'BEGIN:VALARM\nACTION:DISPLAY\nTRIGGER;VALUE=DURATION:RELATED=START:' + event.alarm + '\nEND:VALARM\n' : '') + //TODO: is this always relative?
            (event.allday ? 'TRANSP:TRANSPARENT\n' : 'TRANSP:OPAQUE\n') +
            'END:VEVENT\n' +
            'END:VCALENDAR';
        },
        
        /* The following is taken from 
         * http://keith-wood.name/icalendar.html
         * iCalendar processing for jQuery v1.1.1.
         * Written by Keith Wood (kbwood{at}iinet.com.au) October 2008.
         * Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and
         * MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses.
         * Please attribute the author if you use it.
         */
        /** Parse the iCalendar data into a JavaScript object model.
         @param  content  (string) the original iCalendar data
         @return  (object) the iCalendar JavaScript model
         @throws  errors if the iCalendar structure is incorrect */
        parseICal: function(content){
            var cal = {};
            var timezones = {};
            var lines = this.unfoldLines(content);
            this.parseGroup(lines, 0, cal, timezones);
            if (!cal.vcalendar) {
                throw 'Invalid iCalendar data';
            }
            return cal.vcalendar;
        },
        
        /** iCalendar lines are split so the max length is no more than 75.
         Split lines start with a whitespace character.
         @param  content  (string) the original iCalendar data
         @return  (string[]) the restored iCalendar data */
        unfoldLines: function(content){
            var i;
            var lines = content.replace(/\r\n/g, '\n').split('\n');
            for (i = lines.length - 1; i > 0; i--) {
                var matches = this.FOLDED.exec(lines[i]);
                if (matches) {
                    lines[i - 1] += matches[1];
                    lines[i] = '';
                }
            }
            
            var result = [];
            for (i = 0; i < lines.length; i++) {
                if (lines[i] && lines[i] !== "") {
                    result[result.length] = lines[i];
                }
            }
            return result;
        },
        
        /** Parse a group in the file, delimited by BEGIN:xxx and END:xxx.
         Recurse if an embedded group encountered.
         @param  lines      (string[]) the iCalendar data
         @param  index      (number) the current position within the data
         @param  owner      (object) the current owner for the new group
         @param  timezones  (object) collection of defined timezones
         @return  (number) the updated position after processing this group
         @throws  errors if group structure is incorrect */
        parseGroup: function(lines, index, owner, timezones){
            if (index >= lines.length || lines[index].indexOf('BEGIN:') !== 0) {
                throw 'Missing group start ' + lines[index];
            }
            var name2;
            var group = {};
            var name = lines[index].substr(6);
            this.addEntry(owner, name.toLowerCase(), group);
            index++;
            while (index < lines.length && lines[index].indexOf('END:') !== 0) {
                if (lines[index].indexOf('BEGIN:') === 0) { // Recurse for embedded group
                    index = this.parseGroup(lines, index, group, timezones);
                }
                else {
                    var entry = this.parseEntry(lines[index]);
                    this.addEntry(group, entry._name, (entry._simple ? entry._value : entry));
                }
                index++;
            }
            if (name === 'VTIMEZONE') { // Save timezone offset
                timezones[group.tzid] = group.standard.tzname;
            }
            else {
                for (name2 in group) {
                    this.resolveTimezones(group[name2], timezones);
                }
            }
            if (lines[index] !== 'END:' + name) {
                throw 'Missing group end ' + name;
            }
            return index;
        },
        
        /** Resolve timezone references for dates.
         @param  value  (any) the current value to check - updated if appropriate
         @param  timezones  (object) collection of defined timezones */
        resolveTimezones: function(value, timezones){
            if (!value) {
                return;
            }
            var i;
            
            //We need UTC timestamps for webOs.
            //Dates are parsed into date objects which are interpreted as local timezone, 
            //we manually "shift" them, so that they are UTC if they arrived as UTC => for UTC
            //there is nothing to do here and it's most often not specified anyway. 
            
            //If the time was not in UTC, but of tzid, we will reverse the shift and 
            //let the C++ part get us an correct UTC timestamp. 
            
            //sadly we will introduce a little unconvinience here. Date objects with no
            //TZID specified (and assumed to be UTC) are not processed and therefore will
            //stay date objects. In contrast date objects of other timezones will be automatically
            //converted into timestamps.. but this needs to be handled later anyway..
            
            if (value._value && value.tzid) {
                var tzname = timezones[value.tzid];
                var offsetDate = function(date, tzid){
                    if (tzname === 'UTC') {
                        //Don't need to do anything.. :)
                        date._utctimestamp = date.getTime();
                    }
                    else {
                        date.setMinutes(date.getMinutes() + date.getTimezoneOffset()); //"un"-UTC the date! So that the original value is again in there!
                        log("Timezones: " + JSON.stringify(timezones) + " - " + tzid);
                        log("Get tz for: " + date.getDate() + "." + date.getMonth()+1 + "." + date.getFullYear() + " - " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + " in tz " + tzname);  
                        //This is needed, because utcDate is called for every date!
                        var timestamp = cPlugin.thePluginObject.dateToUTCTimestamp(tzid, date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
                        log("Got timestamp " + timestamp + " for " + date);
                        date._utctimestamp = timestamp * 1000;
                    }
                    date._type = tzid;
                };
                if (this.isArray(value._value)) {
                    for (i = 0; i < value._value.length; i++) {
                        offsetDate(value._value[i], value.tzid);
                    }
                }
                else 
                    if (value._value.start && value._value.end) {
                        offsetDate(value._value.start, value.tzid);
                        offsetDate(value._value.end, value.tzid);
                    }
                    else {
                        offsetDate(value._value, value.tzid);
                    }
            }
            else 
                if (this.isArray(value)) {
                    for (i = 0; i < value.length; i++) {
                        this.resolveTimezones(value[i], timezones);
                    }
                }
        },
        
        /**
         * Replacement for jQuery inArray. Most probably not as efficient.
         * I don't want to include complete jQuery just for this function.. ;)
         * @param {Object} string to search for
         * @param {Object} array  to be searched.
         * @returns -1 if not found, the index if found.
         */
        myInArray: function(string, array){
            var i;
            for (i = 0; i < array.length; i++) {
                if (array[i] === string) {
                    return i;
                }
            }
            return -1;
        },
        
        /** Add a new entry to an object, making multiple entries into an array.
         @param  owner  (object) the owning object for the new entry
         @param  name   (string) the name of the new entry
         @param  value  (string or object) the new entry value */
        addEntry: function(owner, name, value){
            if (typeof value === 'string') {
                value = value.replace(/\\n/g, '\n');
            }
            if (this.myInArray(name, this.RESERVED_NAMES) > -1) {
                name += '_';
            }
            if (owner[name]) { // Turn multiple values into an array
                if (!this.isArray(owner[name]) || owner['_' + name + 'IsArray']) {
                    owner[name] = [owner[name]];
                }
                owner[name][owner[name].length] = value;
                if (owner['_' + name + 'IsArray']) {
                    owner['_' + name + 'IsArray'] = undefined;
                }
            }
            else {
                owner[name] = value;
                if (this.isArray(value)) {
                    owner['_' + name + 'IsArray'] = true;
                }
            }
        },
        
        /** Parse an individual entry.
         The format is: <name>[;<param>=<pvalue>]...:<value>
         @param  line  (string) the line to parse
         @return  (object) the parsed entry with _name and _value
         attributes, _simple to indicate whether or not
         other parameters, and other parameters as necessary */
        parseEntry: function(line){
            var entry = {};
            var matches = this.ENTRY.exec(line);
            if (!matches) {
                throw 'Missing entry name: ' + line;
            }
            entry._name = matches[1].toLowerCase();
            entry._value = this.checkDate(matches[3]);
            entry._simple = true;
            this.parseParams(entry, matches[2]);
            return entry;
        },
        
        /** Parse parameters for an individual entry.
         The format is: <param>=<pvalue>[;...]
         @param  owner   (object) the owning object for the parameters,
         updated with parameters as attributes, and
         _simple to indicate whether or not other parameters
         @param  params  (string or string[]) the parameters to parse */
        parseParams: function(owner, params){
            var param = this.PARAM.exec(params);
            while (param) {
                var values = [];
                var value = this.PARAM_VALUE.exec(param[2]);
                while (value) {
                    values.push(this.checkDate(value[1].replace(/^"(.*)"$/, '$1')));
                    value = this.PARAM_VALUE.exec(param[2]);
                }
                owner[param[1].toLowerCase()] = (values.length > 1 ? values : values[0]);
                owner._simple = false;
                param = this.PARAM.exec(params);
            }
        },
        
        /** Convert a value into a Date object or array of Date objects if appropriate.
         @param  value  (string) the value to check
         @return  (string or Date) the converted value (if appropriate) */
        checkDate: function(value){
            var date;
            var matches = this.DATETIME.exec(value);
            if (matches) {
                date = this.makeDate(matches,false);
                date.allday = false;
                return date;
            }
            matches = this.DATETIME_RANGE.exec(value);
            if (matches) {
                return {
                    start: this.makeDate(matches,false),
                    end: this.makeDate(matches.slice(7),false)
                };
            }
            matches = this.DATEONLY.exec(value);
            if (matches) {
                date = this.makeDate(matches.concat([0, 0, 0, '']),true);
                date.allday = true; //remember that no "time" was given, only day => this hints toward allday event.
                return date;
            }
            return value;
        },
        
        /** Create a date value from matches on a string.
         @param  matches  (string[]) the component parts of the date
         @return  (Date) the corresponding date */
        makeDate: function(matches,allday){
            var date = new Date(matches[1], matches[2] - 1, matches[3], matches[4], matches[5], matches[6]);
            date._type = (matches[7] ? 'UTC' : 'float');
            if (!allday) {
				this.utcDate(date);
			}
            return date;
        },
        
        /** Standardise a date to UTC.
         * Why do we need this? Because JavaScript is a bit nasty here!
         * We don't get the name of our timezone, althoug JS knows it.
         * All we get is the offset. Now, if we get UTC dates, what we
         * are doing here is necessary to correct the interpretation of
         * the date object (date is always local timezone).
         * We can't determine the timezone at this point in time.
         * So we assume UTC here and take measueres to have a correct
         * UTC timezone in the date object.
         * Later we will check the timezone. If it indeed was UTC, we did
         * everything correctly. If it was not, it's easy to correct the
         * mistake by adding the offset again and will do other tricks
         * to get the correct time. See "resolveTimezones".
         *
         @param date (Date) the date to standardise
         @return (Date) the equivalent UTC date */
        utcDate: function(date){
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            return date;
        },
        
        /** Determine whether an object is an array.
         @param  a  (object) the object to test
         @return  (boolean) true if it is an array, or false if not */
        isArray: function(a){
            return (a && a.constructor === Array);
        },
        
        /** Ensure a string has at least two digits.
         @param  value  (number) the number to convert
         @return  (string) the string equivalent */
        _ensureTwo: function(value){
            return (value < 10 ? '0' : '') + value;
        },
        
        /** Format a date for iCalendar: yyyymmdd.
         @param  date   (Date) the date to format
         @return  (string) the formatted date */
        formatDate: function(date, local){
            return (!date ? '' : '' + date.getFullYear() +
            this._ensureTwo(date.getMonth() + 1) +
            this._ensureTwo(date.getDate()));
        },
        
        /** Format a date/time for iCalendar: yyyymmddThhmmss[Z].
         @param  dateTime  (Date) the date/time to format
         @param  local     (boolean) true if this should be a local date/time
         @return  (string) the formatted date/time */
        formatDateTime: function(dateTime, local){
            return (!dateTime ? '' : (local ? '' + dateTime.getFullYear() + this._ensureTwo(dateTime.getMonth() + 1) +
            this._ensureTwo(dateTime.getDate()) +
            'T' +
            this._ensureTwo(dateTime.getHours()) +
            this._ensureTwo(dateTime.getMinutes()) +
            this._ensureTwo(dateTime.getSeconds()) : '' + dateTime.getUTCFullYear() + this._ensureTwo(dateTime.getUTCMonth() + 1) +
            this._ensureTwo(dateTime.getUTCDate()) +
            'T' +
            this._ensureTwo(dateTime.getUTCHours()) +
            this._ensureTwo(dateTime.getUTCMinutes()) +
            this._ensureTwo(dateTime.getUTCSeconds()) +
            'Z'));
        }
    };
}();
