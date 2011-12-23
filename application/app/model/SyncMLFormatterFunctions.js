function formatCretendials(base64login) {
  var cred = ""; 
  cred.append("<Cred>\n");
  cred.append("<Meta>").append("<Type xmlns=\"syncml:metinf\">syncml:auth-basic</Type>\n")
            .append("<Format xmlns=\"syncml:metinf\">b64</Format>\n")
            .append("</Meta>\n").append("<Data>").append(b64Login)
            .append("</Data>").append("</Cred>\n");
        return cred.toString(); 
}

function buildCredHeader(account,sessionId,msgId,url) {
  var login = account.username + ":" + account.password;
  var header;
  var base64login = window.btoa(login);
  log("Login " + login + " codiert: " + base64login);
  var tags = formatCredentials(base64login);
  
  tags += formatMaxMsgSize(this.maxMsgSize);
  
  header = formatSyncHeader(this.sessionId, this.getMsgId(),
      account.deviceId, this.url, tags); //tags of the header.
  return header;
}