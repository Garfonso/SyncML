//JSLint things:
/*global log */
/*jslint indent: 2 */

// This is a small iCal to webOs event parser.
// Its meant to be simple and has some deficiencies.
// It can only parse VCALENDAR objects with exactly one VEVENT in them. 
// It ignores most of the parameter values, if they are not really necessary and won't set them.
// Currently its hardly tied to the needs of the SyncML implementation and an egroupware server.
// Many things might not be really tested.
// ParentId of exceptions to reccurring events is not really set. I try to set it for all events I have an id for.
// If and event has no id set and has exceptions, then an recurringId is set. If the event is an execption it has the parentLocalId set to the same 
// id. That means, that the processing entity should fill the parentId in for this event. 

//Known issues:
//Allday events tend to be very wrong. I hate this... webOs does this very strange... :(
//It wants UTC timestamps, but then seems to calculate the local days from them and makes all overlapped days part of the whole day event.
//This does not comply very good with the iCal way of specifying allday events as just days. So I'll need to add / substract the difference to 
//the local timezone from the all day events start/end TS, right?

var iCal = (function () {
  "use strict";
//  var e = { //structure of webOs events:
//      alarm          : [ { //=VALARM
//        action       : "", //one or more of "audio", "display", "email"
//        alarmTrigger : { //only first one supported (from webpage.. don't really understand what that means. 
//                         //Is this meant to be an array? or only for first alarm supported? or is only datetime supported?
//          value:     "", // "19981208T000000Z | (+/-) PT15M"  
//          valueType: "DURATION"    // DATETIME | DURATION - should match the value. :) => in RFC this is DATE-TIME..?
//          },
//        attach       : "", //string => url / binary? => don't use. :) => not in RFC?
//        description  : "", //text of e-mail body or text description. Does webOs actually support this? I didn't see something like that, yet. => not in RFC?
//        duration     : "", //time between repeats => makes repeat required. 
//        repeat       : 0,  //number of times to repeat. => makes duration required.
//        summary      : "", //subject for e-mail. => not in RFC?
//        trigger      : ""} ], //original trigger string vom iCal. => will be only stored. Hm.
//      allDay         : false, //all day has no time, only a date. TODO: check if that really is true.. we had severe problems with allDay and sync. :( => not in RFC => real problem!
//      attach         : [""], //attachment as uri.
//      attendees      : [{
//        calendarUserType    : "", //comma seperated list of "INDIVIDUAL", "GROUP", "RESOURCE", "ROOM", "UNKNOWN", "other"
//        commonName          : "", //name of attendee.  
//        delegatedFrom       : "",
//        delegatedTo         : "",
//        dir                 : "", //LDAP or webadress - not checked.
//        email               : "",
//        language            : "", //not validated.
//        organizer           : false,
//        member              : string,
//        participationStatus : "", //Comma-separated list of "NEEDS-ACTION", "ACCEPTED", "DECLINED", "TENTATIVE", "DELEGATED", "other". 
//        role                : "", //Comma-separated list of "CHAIR", "REQ-PARTICIPANT", "OPT-PARTICIPANT", "NON-PARTICIPANT", "other".
//        rsvp                : boolean,
//        sentBy              : string }],
//      calendarId     : "",
//      categories     : "",
//      classification : "", //RFC field. "PUBLIC" "PRIVATE" | "CONFIDENTIAL". 
//      comment        : "",
//      contact        : "",
//      created        : 0,  //created time.
//      dtend          : 0,  //end time
//      dtstart        : 0,  //start time
//      dtstamp        : "", //object created.
//      exdates        : [""],
//      geo            : "", //lat/long coordinates listed as "float;float". 
//      lastModified   : 0,  //lastModified
//      location       : "", //event location.
//      note           : "", //text content.
//      parentDtstart  : 0,  //quite complex to fill, see "tryToFillParentID"
//      parentId       : 0,  // same as parteDtstart
//      priority       : 0,  //0-9: 0=undefined, 1=high, 9=low
//      rdates         : [""],
//      recurrenceId   : "",
//      relatedTo      : "",
//      requestStatus  : "",
//      resources      : "",
//      rrule          : { },
//      sequence       : 0,  //kind of "version" of the event.
//      subject        : "", //event subject
//      transp         : "", //"OPAQUE" | "TRANSPARENT". Opaque if this event displays as busy on a calendar, transparent if it displays as free. 
//      tzId           : "",
//      url            : ""
//  }, 
  var dayToNum = { "SU": 0, "MO": 1, "TU": 2, "MI": 3, "TH": 4, "FR": 5, "SA": 6, "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6 },
    numToDay = { "0": "SU", "1": "MO", "2": "TU", "3": "MI", "4": "TH", "5": "FR", "6": "SA", "SU": "SU", "MO": "MO", "TU": "TU", "MI": "MI", "TH": "TH", "FR": "FR", "SA": "SA" },
    DATETIME = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/,
    DATE = /^(\d{4})(\d\d)(\d\d)$/,
  //DATE: yyyymmdd, time: hhmmss, if both are present they are divided by a T. A Z at the end is optional.
  //if only a Date is given (=> allDay), no letters are present and just 8 numbers should be given.
  //Usually the Z at the end of DATE-TIME should say that it's UTC. But I'm quite sure that most programs do this wrong... :(
  //there is a timezone property that could be set. 
  //it could also be a comma seperated list of dates / date times. But we don't support that, yet.. ;)
    recurringEvents = []; //this is used to try to get parentIds. This will only work, if the recurring event is processed in the same session as the exception..


  function unquote(string) {
    if (string === undefined || string === null || typeof (string) !== "string") {
      return string;
    }
    string = string.replace(/\\\\/gi, '\\');
    string = string.replace(/\\,/gi, ',');
    string = string.replace(/\\;/gi, ';');
    string = string.replace(/\\n/gi, '\n');
    string = string.replace(/\\r/gi, '\r');
    string = string.replace(/&amp;/gi, "&");
    string = string.replace(/&lt;/gi, "<");
    string = string.replace(/&gt;/gi, ">");
    string = string.replace(/&quot;/gi, "\"");
    string = string.replace(/&apos;/gi, "'");
    return string;
  }

  function quote(string) {
    if (string === undefined || string === null || typeof (string) !== "string") {
      return string;
    }
    string = string.replace(/\\/gi, "\\\\");
    string = string.replace(/,/gi, "\\,");
    string = string.replace(/;/gi, "\\;");
    string = string.replace(/\n/gi, "\\n");
    string = string.replace(/\r/gi, "\\r");
    string = string.replace(/&/gi, "&amp;");
    string = string.replace(/</gi, "&lt;");
    string = string.replace(/>/gi, "&gt;");
    string = string.replace(/"/gi, "&quot;");
    string = string.replace(/'/gi, "&apos;");
    return string;
  }

  function iCalTimeToWebOsTime(time) {
    var t = {}, result, date, offset = 0;
    t.allDayCue = !DATETIME.test(time);
    if (t.allDayCue) {
      //only have DATE:
      result = DATE.exec(time); //first result is whole match => ignore.
      date = new Date(result[1], result[2] - 1, result[3]);
      //repair time zone offset confusion, look at top of file:
      offset = date.getTimezoneOffset() * 60000; //min*60000 = ms.
      result.push(0); result.push(0); result.push(0);
    } else {
      //have date and time:
      result = DATETIME.exec(time);
    }
    t.ts = Date.UTC(result[1], result[2] - 1, result[3], result[4], result[5], result[6]); //month between 0 and 11 => -1. Strange. :(
    t.ts += offset;
    return t;
  }

  function webOsTimeToICal(time, allDay) {
    var t = "", date;
    date = new Date(time);
    if (allDay) {
      //repair time zone offset confusion, look at commet at top of file => DON'T TAKE UTC here!
      t = date.getFullYear() + (date.getMonth() + 1 < 10 ? "0" : "") + (date.getMonth() + 1) + (date.getDate() < 10 ? "0" : "") + date.getDate();
    } else {
      t = date.getUTCFullYear() + (date.getUTCMonth() + 1 < 10 ? "0" : "") + (date.getUTCMonth() + 1) + (date.getUTCDate() < 10 ? "0" : "") + date.getUTCDate();
      t += "T" + (date.getUTCHours() < 10 ? "0" : "") + date.getUTCHours();
      t += (date.getUTCMinutes() < 10 ? "0" : "") + date.getUTCMinutes();
      t += (date.getUTCSeconds() < 10 ? "0" : "") + date.getUTCSeconds();
      t += "Z"; //to declare that this is UTC. Maybe that helps a bit.
    }
    return t;
  }

  function parseDATEARRAY(str) {
    var parts, times = [], i;
    parts = str.split(",");
    for (i = 0; i < parts.length; i += 1) {
      if (DATE.test(parts[i]) || DATETIME.test(parts[i])) { //skip empty / false values.
        times.push(parts[i]);
      }
    }
    return times;
  }

  //this is strange. This should correctly parse RFC things... even, from RFC, there should also only be numbers in BYDAY, not days.
  //days are only specified for wkst. But the samples from palm, which say that BYSETPOS is not defined (but it's used in their own 
  //samples to explain the rrule object ????) use days for BYDAY... 
  function parseRULEofRRULE(key, value) {
    var days, day, i, rule = { ruleType: key, ruleValue: []};
    days = value.split(",");
    for (i = 0; i < days.length; i += 1) {
      if (days[i].length >= 3) {
        day = days[i].substr(days[i].length - 2); //extract day of week
        day = dayToNum[day];
        if (day) { //really was a day, as it seems. :)
          rule.ruleValue.push({day: day, ord: days[i].substring(0, days[i].length - 2)});
        } else {
          rule.ruleValue.push({ord: days[i]});
        }
      } else {
        rule.ruleValue.push({ord: days[i]});
      }
    }
    return rule;
  }

  function buildRRULE(rr) {
    var text = "RRULE:", i, j, day;
    text += "FREQ=" + rr.freq + ";";
    if (rr.interval) {
      text += "INTERVAL=" + rr.interval + ";";
    }
    if (rr.count) {
      text += "COUNT=" + rr.count + ";";
    }
    if (rr.until) {
      text += "UNTIL=" + webOsTimeToICal(rr.until) + ";";
    }
    if (rr.wkst) {
      text += "WKST=" + numToDay(rr.wkst) + ";";
    }
    for (i = 0; rr.rules && i < rr.rules.length; i += 1) {
      text += rr.rules[i].ruleType + "=";
      for (j = 0; j < rr.rules[i].ruleValue.length; j += 1) {
        day = rr.rules[i].ruleValue[j];
        if (j !== 0) {
          text += ",";
        }
        if (day.ord) {
          text += day.ord;
        }
        if (day.day) {
          if (rr.rules[i].ruleType === "BYDAY") {
            text += numToDay[day.day];
          } else {
            text += day.day;
          }
        }
      }
      text += ";";
    }
    //remove last ";".
    return text.substring(0, text.length - 1);
  }

  function parseRRULE(rs) {
    var rrule = {}, params, kv, i;
    params = rs.split(";");
    for (i = 0; i < params.length; i += 1) {
      kv = params[i].split("=");
      switch (kv[0]) {
      case "FREQ":
        rrule.freq = kv[1];
        break;
      case "COUNT":
        rrule.count = kv[1];
        break;
      case "UNTIL":
        rrule.until = iCalTimeToWebOsTime(kv[1]).ts;
        break;
      case "INTERVAL":
        rrule.interval = kv[1];
        break;
      case "WKST":
        rrule.wkst = dayToNum(kv[1]);
        break;
      case "BYDAY":
      case "BYMONTHDAY":
      case "BYYEARDAY":
      case "BYWEEKNO":
      case "BYMONTH":
        if (!rrule.rules) {
          rrule.rules = [];
        }
        rrule.rules.push(parseRULEofRRULE(kv[0], kv[1]));
        break;
      default:
        log("rrule Parameter " + kv[0] + " not supported. Will skip " + params[i]);
        break;
      }
    }
    return rrule;
  }

  function parseOneLine(line) {
    var lObj = { line: line }, parts, parameters, paramParts, i;
    parts = line.split(":");
    lObj.value = parts[1]; //value is always after :.
    //: is allowed in the value part, add them again:
    for (i = 2; i < parts.length; i += 1) {
      lObj.value += ":" + parts[i]; //this should repair "mailTO:"... :)
    }
    //first part can contain parameters which are seperated from key and themselves with ;
    parameters = parts[0].split(";");
    lObj.key = parameters[0]; //now key is the first part of the parameters, allways.
    for (i = 1; i < parameters.length; i += 1) {
      //have a look at the rest of the parameters, they now have the form KEY=VALUE.
      paramParts = parameters[i].split("=");
      if (!lObj.parameters) {
        lObj.parameters = {};
      }
      lObj.parameters[paramParts[0].toLowerCase()] = paramParts[1];
    }
    return lObj;
  }

  function parseAlarm(lObj, alarm) {
    //webos does not support attendee here => e-Mail won't work. Don't care. Hopefully nothing crashes. ;)
    if (lObj.key === "TRIGGER") {
      //process trigger.
      alarm.trigger = lObj.line; //save complete trigger string.
      //TODO: try to repair some deficiencies of webOs here... for example related end could be easily repaired if dtend and dtstart are known.
      alarm.alarmTrigger = { value: lObj.value, valueType: lObj.parameters.value }; //decode string a bit for webOs.
      if (alarm.alarmTrigger.valueType === "DATE-TIME") {
        //docs say webos wants "DATETIME" not "DATE-TIME" like iCal... :(
        alarm.alarmTrigger.valueType = "DATETIME";
      }
      //log("Parsed trigger " + lObj.line + " to " + JSON.stringify(alarm.alarmTrigger));
    } else if (lObj.key === "END") {
      if (lObj.value !== "VALARM") {
        throw ({name: "SyntaxError", message: "BEGIN:VALARM was not followed by END:VALARM. Something is very wrong here."});
      }
      return undefined;
    } else {
      alarm[lObj.key.toLowerCase()] = lObj.value;
    }
    return alarm;
  }

  function buildALARM(alarm, text) {
    var i, field, translation;
    translation = {
      "action" : "ACTION",
      //alarmTrigger will be handled extra,
      "attach" : "ATTACH",
      "description" : "DESCRIPTION",
      "duration" : "DURATION",
      "repeat" : "REPEAT",
      "trigger": "TRIGGER",
      "summary" : "SUMMARY"
    };
    for (i = 0; i < alarm.length; i += 1) {
      text.push("BEGIN:VALARM");
      for (field in alarm[i]) {
        if (alarm[i].hasOwnProperty(field)) {
          if (field === "alarmTrigger") { //use webos fields to allow edit on device.
            if (!alarm.trigger) {
              text.push("TRIGGER" +
                  (alarm[i].alarmTrigger.valueType === "DATETIME" ? ";VALUE=DATE-TIME" : ";VALUE=DURATION") + //only other mode supported by webOs is DURATION which is the default. 
                  ":" + alarm[i].alarmTrigger.value);
            } else {
              log("Skipped manual trigger for trigger from server.");
            }
          } else if (translation[field]) { //ignore trigger field and other unkown things..
            text.push(translation[field] + ":" + alarm[i][field]); //just copy most values.
          }
        }
      }
      text.push("END:VALARM");
    }
    return text;
  }

  function parseAttendee(lObj, attendees, organizer) {
    var i, attendee = {}, parts, translation;
    if (!attendees) {
      attendees = [];
    }
    if (lObj.parameters) {
      attendee.email = lObj.parameters.email; //sometimes e-mail is in extra parameter.
      if (!attendee.email) { //if not parse value for "MAILTO:e-mail".
        if (lObj.value.indexOf(":") !== -1) {
          parts = lObj.value.split(":"); //might be mailto:...
          for (i = 0; i < parts.length; i += 1) {
            if (parts[i].indexOf("@") !== -1) { //if part contains an @ it's not MAILTO and not X-EGROUPWARE... which egroupware seems to add. Strange.
              attendee.email = parts[i];
              break;
            }
          }
        }
      }
    }
    if (organizer) {
      for (i = 0; attendees && i < attendees.length; i += 1) {
        if (attendees[i].email === attendee.email) {
          attendees[i].organizer = true; //found ORGANIZER field for attendee that already was parsed. Do nothing. :)
          return attendees;
        }
      }
      attendee.organizer = true;
    }
    translation = {
      "cn": "commonName",
      "cutype": "calendarUserType",
      "role": "role",
      "partstat": "participationStatus",
      "rsvp": "rsvp",
      "email": "email",
      "member": "member",
      "DELEGATED-FROM": "delegatedFrom",
      "DELEGATED-TO": "delegatedTo",
      "DIR": "dir",
      "LANGUAGE": "language",
      "SENT-BY": "sentBy"
    };
    //translate all the fields:
    for (i in translation) {
      if (translation.hasOwnProperty(i)) {
        if (lObj.parameters[i]) {
          /*if (i === "cn") {
            lObj.parameters.cn = lObj.parameters.cn.replace(/"/g, ""); //remove " from the name if there are some.
          }*/
          attendee[translation[i]] = lObj.parameters[i];
        }
      }
    }
    //if (!attendee.email) {
      //webos calendar requires email field, but some send nothing for groups.
      //attendee.email = "group-placeholder@invalid.invalid";
    //}
    attendees.push(attendee);
    return attendees;
  }

  function buildATTENDEE(attendee) {
    var text = "ATTENDEE", translation, field, res;
    translation = {
      "commonName": "CN",
      "calendarUserType": "CUTYPE",
      "role": "ROLE",
      "participationStatus": "PARTSTAT",
      "rsvp": "RSVP",
      "email": "EMAIL",
      "member": "MEMBER",
      "delegatedFrom": "DELEGATED-FROM",
      "delegatedTo": "DELEGATED-TO",
      "dir": "DIR",
      "language": "LANGUAGE",
      "sentBy": "SENT-BY"
    };
    //if (attendee.email === "group-placeholder@invalid.invalid") {
   //  delete attendee.email; //remove fake mail
    //}
    for (field in translation) {
      if (translation.hasOwnProperty(field)) {
        if (attendee[field]) {
          text += ";" + translation[field] + "=" + attendee[field];
        }
      }
    }
    text += ":";
    if (attendee.email) {
      text += "MAILTO:" + attendee.email;
    }
    res = [text];
    if (attendee.organizer) {
      res.push("ORGANIZER;CN=" + attendee.commonName + (attendee.email ? (":MAILTO:" + attendee.email) : ":"));
    }
    return res;
  }

  function parseLineIntoObject(lObj, event) {
    var timeObj, translation, translationQuote, transTime;
    //not in webOs: UID
    //in webos but not iCal: allDay, calendarID, parentId, parentDtStart (???)
    //string arrays: attach, exdates, rdates
    //more complex objects: ATTENDEES, ORGANIZER, BEGIN:VALARM, RRULE
    translation = {
      "CATEGORIES"          :   "categories",
      "CLASS"               :   "classification",
      "GEO"                 :   "geo",
      "CONTACT"             :   "contact",
      "PRIORITY"            :   "priority",
      "RELATED-TO"          :   "relatedTo",
      "STATUS"              :   "requestStatus",
      "RESOURCES"           :   "resources",
      "SEQUENCE"            :   "sequence",
      "TRANSP"              :   "transp",
      "TZID"                :   "tzId",
      "URL"                 :   "url",
      "RECURRENCE-ID"       :   "recurrenceId",
      "UID"                 :   "uId" //try to sed uId. I hope it will be saved in DB although docs don't talk about it. ;)
    };
    translationQuote = {
      "COMMENT"           :   "comment",
      "DESCRIPTION"       :   "note",
      "LOCATION"          :   "location",
      "SUMMARY"           :   "subject"
    };
    transTime = {
      "DTSTAMP"           :   "dtstamp",
      "DTSTART"           :   "dtstart",
      "DTEND"             :   "dtend",
      "CREATED"           :   "created",
      "LAST-MODIFIED"     :   "lastModified"
    };
    //most parameters ignored for the simple objects... hm. But they mostly have none, right? 
    if (translation[lObj.key]) {
      event[translation[lObj.key]] = lObj.value;
    } else if (translationQuote[lObj.key]) {
      event[translationQuote[lObj.key]] = unquote(lObj.value);
    } else if (transTime[lObj.key]) {
      timeObj = iCalTimeToWebOsTime(lObj.value);
      event[transTime[lObj.key]] = timeObj.ts;
      if (lObj.key === "DTSTART") { //decide from DTSTART if event is allDay. AllDay has no time, only date.
        event.allDay = timeObj.allDayCue;
      }
    } else { //one of the more complex cases.
      switch (lObj.key) {
      case "ATTACH": //I still don't get why this is an array?
        if (!event.attach) {
          event.attach = [];
        }
        event.attach.push(lObj.value);
        break;
      case "EXDATE": //EXDATE / RDATE is a list of timestamps . webOs wants them in an array 
        event.exdates = parseDATEARRAY(lObj.value); // => split list, fill array. Doc says webos wants the date-time strings not ts like everywhere else.. hm.
        break;
      case "RDATE": //EXDATE / RDATE is a list of timestamps . webOs wants them in an array 
        event.rdates = parseDATEARRAY(lObj.value); // => split list, fill array. Doc says webos wants the date-time strings not ts like everywhere else.. hm.
        break;
      case "BEGIN": //ignore begins other than ALARM. 
        if (lObj.value === "VALARM") {
          event.alarm.push({}); //add new alarm object.
          event.alarmMode = true;
        }
        break;
      case "ORGANIZER":
        //organizer is a full attendee again. Problem: This might cause duplicate attendees!
        //if there is just one attendee, there is just an organizer field and no attendee field at all.
        //but if there are more attendees, then there is an attendee field for the organizer and an
        //organizer field also that also contains most of the data...
        event.attendees = parseAttendee(lObj, event.attendees, true);
        break;
      case "ATTENDEE":
        event.attendees = parseAttendee(lObj, event.attendees, false);
        break;
      case "RRULE":
        event.rrule = parseRRULE(lObj.value);
        break;
      default:
        if (lObj.key !== "VERSION" && lObj.key !== "PRODID" && lObj.key !== "METHOD" && lObj.key !== "END") {
          log("My translation from iCal to webOs event does not understand " + lObj.key + " yet. Will skip line " + lObj.line);
        }
        break;
      }
    }
    return event;
  }

  function tryToFillParentId(event) {
    var i, j, revent, ts,  thisTS;
    //try to fill "parent id" and parentdtstamp for exceptions to recurring dates. 
    if (event.exdates && event.exdates.length > 0) {
      //log("Event has exdates: " + JSON.stringify(event.exdates) + " remembering it as recurring.");
      event.recurringId = recurringEvents.length; //save index for recurring event to add ids later.
      recurringEvents.push(event);
    }

    //this will only work, if parent was processed before... :(
    if (event.recurrenceId) {
      thisTS = event.recurrenceId; //from webOs-docs recurrenceId is DATETIME not webOs-timestamp.
      for (i = 0; i < recurringEvents.length; i += 1) {
        revent = recurringEvents[i];
        //log("Checking if event is exception for " + JSON.stringify(revent.exdates));
        for (j = 0; j < revent.exdates.length; j += 1) {
          ts = revent.exdates[j];
          //log("Matching TS: " + ts + " = " + thisTS);
          if (ts === thisTS) {
            event.parentDtstart = revent.dtstart;
            event.parentId = revent._id;
            if (!event.parentId) {
              log("Need to add parentId later, because it does not exist, yet. Saving this element as child for parent " + i);
              event.parentLocalId = i;
            } else {
              log("Found parent event with eventId " + revent._id + " ts: " + ts + " this ts " + event.recurrenceId);
            }
            event.relatedTo = revent.uId;
            return event;
          }
        }
      }
    }
    if (event.recurrenceId) {
      log("Did not find parent event. :(");
    }
    return event;
  }

  function applyHacks(event, ical) { //TODO: read product from id to have an idea which hacks to apply.. or similar.
    var i, val, start, date, diff;

    //webOs does not support DATE-TIME as alarm trigger. Try to calculate a relative alarm from that...
    //issue: this does not work, if server and device are in different timezones. Then the offset from 
    //server to GMT still exists... hm.
    for (i = 0; event.alarm && i < event.alarm.length; i += 1) {
      if (event.alarm[i].alarmTrigger.valueType === "DATETIME" || event.alarm[i].alarmTrigger.valueType === "DATE-TIME") {
        val = iCalTimeToWebOsTime(event.alarm[i].alarmTrigger.value).ts;
        //log("Value: " + event.alarm[i].alarmTrigger.value);
        //log("Val: " + val);
        start = event.dtstart;
        //log("start: " + start);
        date = new Date(start);
        //log("Date: " + date);
        diff = (val - start) / 60000; //now minutes.
        //log("Diff is " + diff);
        if (event.allDay) {
          diff += date.getTimezoneOffset(); //remedy allday hack.
          //log("localized: " + diff);
        }
        if (diff < 0) {
          val = "-PT";
          diff *= -1;
        } else {
          val = "PT";
        }
        if (diff % 1440 === 0) { //we have days. :)
          val += diff / 1440 + "D";
        } else if (diff % 60 === 0) {
          val += diff / 60 + "H";
        } else {
          val += diff + "M";
        }
        //log("Val is: " + val);
        event.alarm[i].alarmTrigger.value = val;
        event.alarm[i].alarmTrigger.valueType = "DURATION";
      }
    }

    //allday events that span more than one day get one day to long in webOs.
    //webOs itself defines allDay events from 0:00 on the first day to 23:59 on the last day. 
    //so substracting one second should repair this issue (hopefully :().
    if (event.allDay) { //86400000 = one day.
      event.dtend -= 1000;
    }
    return event;
  }

  function removeHacks(event) {
    if (event.allDay) {
      event.dtend += 1000;
    }
    return event;
  }

  return {
    parseICal: function (ical) {
      var proc, lines, lines2, line, j, i, lObj, event = { tzId: "UTC", alarm: []}, alarm;
      proc = ical.replace(/\r\n /g, ""); //remove line breaks in key:value pairs.
      proc = proc.replace(/\n /g, ""); //remove line breaks in key:value pairs.
      lines = proc.split("\r\n"); //now every line contains a key:value pair => split them. somehow the \r seems to get lost somewhere?? is this always the case?
      for (i = 0; i < lines.length; i += 1) {
        lines2 = lines[i].split("\n");
        for (j = 0; j < lines2.length; j += 1) {
          line = lines2[j];
          if (line !== "") { //filter possible empty lines.
            lObj = parseOneLine(line);
            if (event.alarmMode) {
              alarm = parseAlarm(lObj, event.alarm[event.alarm.length - 1]);
              if (alarm) {
                event.alarm[event.alarm.length - 1] = alarm;
              } else {
                delete event.alarmMode; //switch off alarm mode.
              }
            } else {
              event = parseLineIntoObject(lObj, event);
            }
          }
        }
      }

      event = tryToFillParentId(event);
      event = applyHacks(event, ical);
      return event;
    },

    generateICal: function (event) {
      var field, i, line, offset, text = [], translation, translationQuote, transTime, allDay;
      //not in webOs: UID
      //in webos but not iCal: allDay, calendarID, parentId, parentDtStart (???)
      //string arrays: attach, exdates, rdates
      //more complex objects: ATTENDEES, ORGANIZER, BEGIN:VALARM, RRULE
      translation = {
        "categories"          :   "CATEGORIES",
        "classification"      :   "CLASS",
        "geo"                 :   "GEO",
        "contact"             :   "CONTACT",
        "priority"            :   "PRIORITY",
        "relatedTo"           :   "RELATED-TO",
        "requestStatus"       :   "STATUS",
        "resources"           :   "RESOURCES",
        "sequence"            :   "SEQUENCE",
        //"transp"              :   "TRANSP", //intentionally skip this to let server decide...
        "tzId"                :   "TZID",
        "url"                 :   "URL",
        "recurrenceId"        :   "RECURRENCE-ID;VALUE=DATE-TIME",
        "uId"                 :   "UID" //try to sed uId. I hope it will be saved in DB although docs don't talk about it. ;)
      };
      translationQuote = {
        "comment"           :   "COMMENT",
        "note"              :   "DESCRIPTION",
        "location"          :   "LOCATION",
        "subject"           :   "SUMMARY"
      };
      transTime = {
        //"dtstamp"           :   "DTSTAMP",
        "created"           :   "CREATED",
        "lastModified"      :   "LAST-MODIFIED",
        "dtstart"           :   "DTSTART",
        "dtend"             :   "DTEND"
      };
      if (event._del === true) {
        return "";
      }
      event = removeHacks(event);
      text.push("BEGIN:VCALENDAR");
      text.push("VERSION:2.0");
      text.push("PRODID:MOBO.SYNCML.0.0.3");
      text.push("METHOD:PUBLISH");
      text.push("BEGIN:VEVENT");
      for (field in event) {
        if (event.hasOwnProperty(field)) {
          if (translation[field]) {
            text.push(translation[field] + ":" + event[field]);
          } else if (translationQuote[field]) {
            text.push(translationQuote[field] + ":" + quote(event[field]));
          } else if (transTime[field]) {
            allDay = event.allDay;
            if (field !== "dtstart" && field !== "dtend") {
              allDay = false;
            }
            text.push(transTime[field] + (allDay ? ";VALUE=DATE:" : ":") + webOsTimeToICal(event[field], allDay));
          } else { //more complex fields.
            switch (field) {
            case "attach":
              text.push("ATTACH:" + event.attach.join("")); //still don't have a clue why this is an array..
              break;
            case "exdates":
              text.push("EXDATE;VALUE=DATE-TIME:" + event.exdates.join(","));
              break;
            case "rdates":
              text.push("RDATE:" + event.rdates.join(","));
              break;
            case "alarm":
              text = buildALARM(event.alarm, text);
              break;
            case "attendees":
              for (i = 0; event.attendees && i < event.attendees.length; i += 1) {
                text = text.concat(buildATTENDEE(event.attendees[i]));
              }
              break;
            case "rrule":
              if (event.rrule) {
                text.push(buildRRULE(event.rrule));
              }
              break;
            default:
              if (field !== "_id" && field !== "_kind" && field !== "_rev" && field !== "parentId" && field !== "allDay" &&
                  field !== "eventDisplayRevset" && field !== "parentDtstart" && field !== "calendarId" && field !== "transp" && field !== "accountId" &&
                  field !== "dtstamp" && field !== "created" && field !== "lastModified") {
                log("Unknown field " + field + " in event object with value " + JSON.stringify(event[field]));
              }
              break;
            }
          }
        }
      } //field loop

      /*text.push("DTSTART" + (event.allDay ? ";VALUE=DATE:" : ":") + webOsTimeToICal(event.dtstart, event.allDay));
      text.push("DTEND" + (event.allDay ? ";VALUE=DATE:" : ":") + webOsTimeToICal(event.dtend, event.allDay));
      if (event.subject) {
        text.push("SUMMARY:" + quote(event.subject));
      }
      if (event.note) {
        text.push("DESCRIPTION:" + quote(event.note));
      }
      if (event.location) {
        text.push("LOCATION:" + quote(event.location));
      }
      if (event.categories) {
        text.push("CATEGORIES:" + event.categories);
      }
      if (event.rrule) {
        text.push(buildRRULE(event.rrule));
      }
      if (event.exdates) {
        text.push("EXDATE;VALUE=DATE-TIME:" + event.exdates.join(","));
      }
      if (event.transp) {
        text.push("TRANSP:" + event.transp);
      }*/
      text.push("END:VEVENT");
      text.push("END:VCALENDAR");

      //make sure no line is longer than 75 characters.
      for (i = 0; i < text.length; i += 1) {
        line = text[i];
        offset = 0;
        while (line.length > 75) {
          //leaf a bit room while splitting.
          text.splice(i + offset, 1, line.substr(0, 70), " " + line.substr(70)); //take out last element and add two new ones.
          offset += 1;
          line = text[i];
        }
      }
      return text.join("\r\n") + "\r\n";
    }
  }; //end of public interface
}());