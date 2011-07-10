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
	cred = new StringBuffer(); 
	cred.append("<Cred>\n");
	cred.append("<Meta>").append("<Type xmlns=\"syncml:metinf\">syncml:auth-basic</Type>\n")
            .append("<Format xmlns=\"syncml:metinf\">b64</Format>\n")
            .append("</Meta>\n").append("<Data>").append(b64Login)
            .append("</Data>").append("</Cred>\n");
        return cred.toString(); 
} 

function formatSyncHeader(sessionid, msgid, src, tgt, tags) {
	ret = new StringBuffer();

        ret.append("<SyncHdr>\n").append("<VerDTD>1.2</VerDTD>\n")
           .append("<VerProto>SyncML/1.2</VerProto>\n").append("<SessionID>")
           .append(sessionid).append("</SessionID>\n").append("<MsgID>")
           .append(msgid).append("</MsgID>\n").append("<Target><LocURI>")
           .append(tgt).append("</LocURI></Target>\n").append("<Source><LocURI>")
           .append(src).append("</LocURI></Source>\n");

        if (tags !== null) {
            ret.append(tags);
        }
        ret.append("</SyncHdr>\n"); 
        return ret.toString();
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
        sb = new StringBuffer();
        sb.append("<DevInf xmlns='syncml:devinf'>\n").append("<VerDTD>1.2</VerDTD>\n")//mandatory
          .append("<Man>" + devInf.man + "</Man>\n")//mandatory: name of the manufacturer of the device
          .append("<Mod>" + devInf.mod + "</Mod>\n")//mandatory: model name or model number of the device
          .append("<OEM>" + devInf.oem + "</OEM>\n")//optional: Original Equipment Manufacturer
          .append("<FwV>" + devInf.fwv + "</FwV>\n")//mandatory: firmware version of the device or a date
          .append("<SwV>" + devInf.swv + "</SwV>\n")//mandatory: software version of the device or a date
          .append("<HwV>" + devInf.hwv + "</HwV>\n")//mandatory: hardware version of the device or a date
          .append("<DevID>" + devInf.devID + "</DevID>\n")//mandatory: identifier of the source synchronization device
          .append("<DevTyp>" + devInf.devType + "</DevTyp>\n");//mandatory: type of the source synchronization device (see OMA table)

        //optional flag (if present, the server SHOULD send time in UTC form)
        if (devInf.utc) {
            sb.append("<UTC/>\n");
        }
        //optional (if present, it specifies that the device supports receiving
        //large objects)
        if (devInf.loSupport) {
            sb.append("<SupportLargeObjs/>\n");
        }
        //optional: server MUST NOT send <NumberOfChanges> if the client has
        //not specified this flag
        if (devInf.nocSupport) {
            sb.append("<SupportNumberOfChanges/>\n");
        }

        //<DataStore> one for each of the local datastores
        sb.append("<DataStore>\n")//
          .append("<SourceRef>" + sourceName + "</SourceRef>\n") //required for each specified datastore
          .append("<Rx-Pref>\n").append("<CTType>").append(sourceType)
          .append("</CTType>\n").append("<VerCT></VerCT>\n")
          .append("</Rx-Pref>\n") //required for each specified datastore
          .append("<Tx-Pref>\n").append("<CTType>").append(sourceType)
          .append("</CTType>\n").append("<VerCT></VerCT>\n").append("</Tx-Pref>\n") //SyncCap
          .append("<SyncCap>\n")//mandatory
          .append("<SyncType>1</SyncType>\n")//Support of 'two-way sync'
          .append("<SyncType>2</SyncType>\n")//Support of 'slow two-way sync'
          //TODO: add support of one way?
          .append("<SyncType>7</SyncType>\n")//Support of 'server alerted sync'
          .append("</SyncCap>\n").append("</DataStore>\n").append("</DevInf>\n");

        return sb.toString();
}
function formatPutDeviceInfo(cmdId, devInf, sourceName, sourceType) {
sb = new StringBuffer();

        //TODO: retrieve most values from the passed DeviceConfig object
        sb.append("<Put>\n")
          .append("<CmdID>").append(cmdId).append("</CmdID>\n")
          .append("<Meta>\n")
          .append("<Type xmlns='syncml:metinf'>application/vnd.syncml-devinf+xml</Type>\n")
          .append("</Meta>\n").append("<Item>\n")
          .append("<Source><LocURI>./devinf12</LocURI></Source>\n")
          .append("<Data>\n").append(createDevInf(devInf, sourceName, sourceType)) //closing all tags
          .append("</Data>\n").append("</Item>\n").append("</Put>\n");

        return sb.toString();
}

function formatAlerts(cmdId, syncMode, nextAnchor,
                               lastAnchor, sourceSyncMode,
                               sourceName,
                               sourceUri,
                               filter,
                               maxDataSize) {

        sb = new StringBuffer();

        // XXX CHECK IT OUT XXX
        // the Last overwrite the Next?????????????????
        var timestamp = "<Next>" + nextAnchor + "</Next>\n";

        if (lastAnchor !== 0) {
            timestamp = "<Last>" + lastAnchor + "</Last>\n" + timestamp;
        }

        sb.append("<Alert>\n");
        sb.append("<CmdID>" + cmdId + "</CmdID>\n");
        sb.append("<Data>");

        // First, use the syncMode passed as argument,
        // if not valid, use the default for the source
        // as last chance, check the anchor.
        if (syncMode !== 0) {
            sb.append(syncMode);
        } else if (sourceSyncMode !== 0) {
            sb.append(SyncML.ALERT_CODE_SLOW);
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
