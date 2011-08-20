function formatXMLDeclaration() {
	return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
}
function formatStartSyncML() {
	return "<SyncML>\n";
}                                                                                  
function formatStartSyncBody() {
	return "<SyncBody>\n";
}
function formatEndSyncBody() {
	return "</SyncBody>\n";
}
function formatFinal() {
	return "<Final/>\n";
}
function formatEndSyncML() {
	return "</SyncML>\n";
}
function formatCredentials(b64Login) {
	var cred = "<Cred>\n"
	         + "<Meta><Type xmlns=\"syncml:metinf\">syncml:auth-basic</Type>\n"
             + "<Format xmlns=\"syncml:metinf\">b64</Format>\n" 
             + "</Meta>\n"
             + "<Data>" + b64Login
             + "</Data></Cred>\n";
        return cred; 
} 

function formatSyncHeader(sessionid, msgid, src, tgt, tags) {
	var ret = "<SyncHdr>\n"
            + "<VerDTD>1.2</VerDTD>\n"
            + "<VerProto>SyncML/1.2</VerProto>\n"
            + "<SessionID>" + sessionid + "</SessionID>\n"
            + "<MsgID>" + msgid + "</MsgID>\n"
            + "<Target><LocURI>" + tgt + "</LocURI></Target>\n"
            + "<Source><LocURI>" + src + "</LocURI></Source>\n";

        if (tags !== null) {
            ret += tags;
        }
        ret += "</SyncHdr>\n"; 
        return ret;
} 
function formatMaxMsgSize(maxSize) {
	return "<Meta><MaxMsgSize>"+maxSize+"</MaxMsgSize></Meta>\n";
}

function createDevInf(devInf, sourceName, sourceType) {
	if (devInf.man === null) {
            devInf.man = "";
        }

        if (devInf.mod === null) {
            devInf.mod = "";
        }

        if (devInf.oem === null) {
            devInf.oem = "";
        }

        if (devInf.fwv === null) {
            devInf.fwv = "";
        }

        if (devInf.swv === null) {
            devInf.swv = "";
        }

        if (devInf.hwv === null) {
            devInf.hwv = "";
        }

        if (devInf.devID === null) {
            devInf.devID = "";
        }

        if (devInf.devType === null) {
            devInf.devType = "";
        }
        
        var sb = "<DevInf xmlns='syncml:devinf'>\n" 
        	   + "<VerDTD>1.2</VerDTD>\n"          //mandatory
               + "<Man>" + devInf.man + "</Man>\n" //mandatory: name of the manufacturer of the device
               + "<Mod>" + devInf.mod + "</Mod>\n" //mandatory: model name or model number of the device
               + "<OEM>" + devInf.oem + "</OEM>\n" //optional: Original Equipment Manufacturer
               + "<FwV>" + devInf.fwv + "</FwV>\n" //mandatory: firmware version of the device or a date
               + "<SwV>" + devInf.swv + "</SwV>\n" //mandatory: software version of the device or a date
               + "<HwV>" + devInf.hwv + "</HwV>\n" //mandatory: hardware version of the device or a date
               + "<DevID>" + devInf.devID + "</DevID>\n" //mandatory: identifier of the source synchronization device
               + "<DevTyp>" + devInf.devType + "</DevTyp>\n"; //mandatory: type of the source synchronization device (see OMA table)

        //optional flag (if present, the server SHOULD send time in UTC form)
        if (devInf.utc) {
            sb += "<UTC/>\n";
        }
        //optional (if present, it specifies that the device supports receiving
        //large objects)
        if (devInf.loSupport) {
            sb += "<SupportLargeObjs/>\n";
        }
        //optional: server MUST NOT send <NumberOfChanges> if the client has
        //not specified this flag
        if (devInf.nocSupport) {
            sb += "<SupportNumberOfChanges/>\n";
        }

        //<DataStore> one for each of the local datastores
        sb += "<DataStore>\n" //
            + "<SourceRef>" + sourceName + "</SourceRef>\n" //required for each specified datastore
            + "<Rx-Pref>\n"
            + "<CTType>" + sourceType + "</CTType>\n"
            + "<VerCT></VerCT>\n"
            + "</Rx-Pref>\n" //required for each specified datastore
            + "<Tx-Pref>\n"
            + "<CTType>" + sourceType + "</CTType>\n"
            + "<VerCT></VerCT>\n"
            + "</Tx-Pref>\n" //SyncCap
            + "<SyncCap>\n"//mandatory
            + "<SyncType>1</SyncType>\n" //Support of 'two-way sync'
            + "<SyncType>2</SyncType>\n" //Support of 'slow two-way sync'
          //TODO: add support of one way?
            + "<SyncType>7</SyncType>\n" //Support of 'server alerted sync'
            + "</SyncCap>\n"
            + "</DataStore>\n"
            + "</DevInf>\n";

        return sb;
}
function formatPutDeviceInfo(cmdId, devInf, sourceName, sourceType) {
        //TODO: retrieve most values from the passed DeviceConfig object
        var sb = "<Put>\n"
               + "<CmdID>" + cmdId + "</CmdID>\n"
               + "<Meta>\n"
               + "<Type xmlns='syncml:metinf'>application/vnd.syncml-devinf+xml</Type>\n"
               + "</Meta>\n"
               + "<Item>\n"
               + "<Source><LocURI>./devinf12</LocURI></Source>\n"
               + "<Data>\n"
               + createDevInf(devInf, sourceName, sourceType) //closing all tags
               + "</Data>\n"
               + "</Item>\n"
               + "</Put>\n";

        return sb;
}

function formatAlerts(cmdId, syncMode, nextAnchor,
                               lastAnchor, sourceSyncMode,
                               sourceName,
                               sourceUri,
                               filter,
                               maxDataSize) {

        var sb;

        // XXX CHECK IT OUT XXX
        // the Last overwrite the Next?????????????????
        var timestamp = "<Next>" + nextAnchor + "</Next>\n";

        if (lastAnchor !== 0) {
            timestamp = "<Last>" + lastAnchor + "</Last>\n" + timestamp;
        }

        sb += "<Alert>\n";
        sb += "<CmdID>" + cmdId + "</CmdID>\n";
        sb += "<Data>";

        // First, use the syncMode passed as argument,
        // if not valid, use the default for the source
        // as last chance, check the anchor.
        if (syncMode !== 0) {
            sb += syncMode;
        } else if (sourceSyncMode !== 0) {
            sb += SyncML.ALERT_CODE_SLOW; //TODO: wo kommt das her??
        } else if (lastAnchor !== 0) {
            sb.append(SyncML.ALERT_CODE_FAST);
        } else {
            sb.append(sourceSyncMode);
        }

        sb.append("</Data>\n");
        sb.append("<Item>\n");
        sb.append("<Target><LocURI>");
        sb.append(sourceUri);
        sb.append("</LocURI>\n");
        // Apply source filter with a default limit to maxMsgSize.
        // TODO: change it to maxObjSize when the Large Object will be
        // implemented.
        if (filter !== null) {
            sb.append(filter.toSyncML(maxDataSize));
        }
        sb.append("</Target>\n");
        sb.append("<Source><LocURI>");
        sb.append(sourceName);
        sb.append("</LocURI></Source>\n");
        sb.append("<Meta>\n");
        sb.append("<Anchor xmlns=\"syncml:metinf\">\n");
        sb.append(timestamp);
        sb.append("</Anchor>\n");
        sb.append("</Meta>\n");
        sb.append("</Item>\n");
        sb.append("</Alert>");
        sb.append("\n");

        return sb.toString();
} 

function formatAlertStatus(status, nextAnchor) {

        fStatus = new StringBuffer();
        fStatus.append("<Status>\n")
               .append("<CmdID>").append(status.cmdId).append("</CmdID>\n")
               .append("<MsgRef>").append(status.msgref).append("</MsgRef>")
               .append("<CmdRef>").append(status.cmrefd).append("</CmdRef>")
               .append("<Cmd>Alert</Cmd>\n")
               .append("<TargetRef>").append(status.tgt).append("</TargetRef>\n")
               .append("<SourceRef>").append(status.src).append("</SourceRef>\n")
               .append("<Data>").append(status.status).append("</Data>\n")
               .append("<Item>\n").append("<Data>\n")
               .append("<Anchor xmlns=\"syncml:metinf\">")
               .append("<Next>").append(nextAnchor).append("</Next>")
               .append("</Anchor>\n")
               .append("</Data>\n").append("</Item>\n").append("</Status>\n");

        return fStatus.toString();
} 
function formatSyncHdrStatus(status) {
	fStatus = new StringBuffer();

        fStatus.append("<Status>\n")
               .append("<CmdID>").append(status.cmdId).append("</CmdID>\n")
               .append("<MsgRef>").append(status.msgref).append("</MsgRef>\n")
               .append("<CmdRef>").append(status.cmdref).append("</CmdRef>\n")
               .append("<Cmd>").append(status.cmd).append("</Cmd>\n")
               .append("<TargetRef>").append(status.tgt).append("</TargetRef>\n")
               .append("<SourceRef>").append(status.src).append("</SourceRef>\n")
               .append("<Data>").append(status.status).append("</Data>\n")
               .append("</Status>\n");

        return fStatus.toString();
}
function formatItemStatus(status) {
        ret = new StringBuffer("<Status>");
       
        ret.append("<CmdID>").append(status.cmdId).append("</CmdID>\n").
            append("<MsgRef>").append(status.msgref).append("</MsgRef>\n").
            append("<CmdRef>").append(status.cmdref).append("</CmdRef>\n").
            append("<Cmd>").append(status.cmd).append("</Cmd>\n");
        
        var srcRef = status.src;
        var tgtRef = status.tgt;
        if (srcRef !== null) {
            ret.append("<SourceRef>").append(srcRef).append("</SourceRef>\n");
        }
        if (tgtRef !== null) {
            ret.append("<TargetRef>").append(tgtRef).append("</TargetRef>\n");
        }
        /* var items = status.getItemKeys();
        if (items != null) {
            for(int i=0, l=items.length; i<l; i++) {
                ret.append("<Item><Source><LocURI>").append(items[i])
                .append("</LogURI></Source></Item>");
            }
        } */
        
        ret.append("<Data>").append(status.status).append("</Data>\n")
           .append("</Status>\n");
        
        return ret.toString();
 }
 function formatMappings(nextCmdId, sourceName, sourceUri, mappings) {
 	 var out = new StringBuffer();
 	 out.append("<Map>\n").append("<CmdID>" + nextCmdId + "</CmdID>\n")
           .append("<Target>\n").append("<LocURI>" + sourceUri + "</LocURI>\n")
           .append("</Target>\n").append("<Source>\n")
           .append("<LocURI>" + sourceName + "</LocURI>\n").append("</Source>\n");
         var mappingKeys = Object.keys(mappings);
         var mappingKeysLength = mappingKeys.length;
         for (var i=0; i<mappingKeysLength; i++) {
         	 var sourceRef = mappingKeys[i];
         	 var targetRef = mappings[sourceRef];
         	 out.append("<MapItem>\n").append("<Target>\n")
               .append("<LocURI>" + targetRef + "</LocURI>\n")
               .append("</Target>\n").append("<Source>\n")
               .append("<LocURI>" + sourceRef + "</LocURI>\n")
               .append("</Source>\n").append("</MapItem>\n");
         }
         out.append("</Map>\n");
         return out.toString();
 }
 function formatStartSync() {
 	 return "<Sync>\n";
 }
 function formatSyncTagPreamble(nextCmdId, sourceName, sourceUri) {
 	 syncTag = new StringBuffer();

        syncTag.append("<CmdID>").append(nextCmdId)
               .append("</CmdID>\n")
               .append("<Target><LocURI>")
               .append(sourceUri)
               .append("</LocURI></Target>\n")
               .append("<Source><LocURI>")
               .append(sourceName)
               .append("</LocURI></Source>\n");

        return syncTag.toString();
 }
