//JSLint stuff:
/*global Contacts, fs, log, Future, path, MimeTypes, quoted_printable_decode, quoted_printable_encode, quote */

var vCard = (function () { 
  var importer,
    exporter,
    tmpPath = "/tmp/syncml-contacts/", //don't forget trailling slash!!
    vCardIndex = 0;
    
    function cleanUpEmptyFields(obj) {
      var field;
      if (typeof obj === "object") {
        for (field in obj) {
          if (typeof obj[field] === "string") {
            if (obj[field] === "") {
              delete obj[field];
            }
          } else if (typeof obj[field] === "object") {
            cleanUpEmptyFields(obj[field]);
          }
        }
      }
    }
  
  //public interface:
  return {
    initialize: function (outerFuture) { 
      var finished = function () {
        var res = outerFuture.result;
        if (!res) {
          res = {};
        }
        res.vCard = true;
        outerFuture.result = res;
      };
    
      //check that a temporary file path exists to save/read vcards to.
      path.exists(tmpPath, function(exists)  {
        if (!exists) {
          fs.mkdir(tmpPath, function (error) {
            if (error) {
              log("Could not create tmp-path, error: " + JSON.stringify(error));
            }
            finished();
          });
        } else {
          finished();
        }
      });
    },
  
    //parameters:
    //vcard = text representation of vcard
    //account = full account object.
    //serverData = configuration data of the server..
    parseVCard: function (input) {
      var resFuture = new Future(), 
        filename = tmpPath + (input.account.name || "nameless") + "_" + vCardIndex + ".vcf", 
        vCardImporter,
        currentLine,
        lines,
        data,
        i,
        version = (input.serverData && input.serverData.serverType === MimeTypes.contacts.fallback) ? "3.0" : "2.1", 
        emptyLine = /^[A-Za-z;\-_]*:[;]*$/;
      vCardIndex += 1;
      
      if (!input.vCard) {
        log("Empty vCard received.");
        return new Future({returnValue: false});
      }
      
      log("Writing vCard to file " + filename);
      log("vCard data: " + input.vCard);
      lines = input.vCard.split(/\r?\n/);
      data = [];
      for (i = 0; i < lines.length; i += 1) {
        currentLine = lines[i];
        if (!emptyLine.test(currentLine)) {
          if (version === "2.1") {
            currentLine = quoted_printable_decode(currentLine);
          }
          //currentLine = unquote(currentLine);
          data.push(currentLine);
        } else {
          log("Skipping empty line " + currentLine);
        }
      }
      input.vCard = data.join("\r\n");
      log("vCard data cleaned up: " + input.vCard);
      fs.writeFile(filename, input.vCard, "utf-8", function (err) {
        if (err) {
          log("Could not write vCard to file: " + filename + " Error: " + JSON.stringify(err));
        } else {
          log("Saved vCard to " + filename);
          //setup importer
          vCardImporter = new Contacts.vCardImporter({filePath: filename, importToAccountId: input.account.accountId, version: version});
          //do import:
          var future = vCardImporter.readVCard();
          future.then(function (f) {
            var obj = f.result[0].getDBObject();
            log("Contact: " + JSON.stringify(obj));
            //cleanUpEmptyFields(obj);
            //log("Contact after cleanup: " + JSON.stringify(obj));
            resFuture.result = {returnValue: true, results: [obj]};
            fs.unlink(filename);
          });
        }
      });
      
      return resFuture;
    },
        
    //input:
    //contactId
    generateVCard: function (input) {
      var resFuture = new Future(), note, 
        filename = tmpPath + (input.accountName || "nameless") + "_" + vCardIndex + ".vcf", 
        version = (input.serverData && input.serverData.serverType === MimeTypes.contacts.fallback) ? "3.0" : "2.1", 
        vCardExporter = new Contacts.VCardExporter({ filePath: filename, version: version }); //could set vCardVersion here to decide if 3.0 or 2.1, default will be 3.0... is that really necessary?
      vCardIndex += 1;
      
      Contacts.Utils.defineConstant("kind", "info.mobo.syncml.contact:1", Contacts.Person);
      log("Get contact " + input.contactId + " transfer it to version " + version + " vCard.");
      vCardExporter.exportOne(input.contactId, false).then(function (future) {
        log("webOS saved vCard to " + filename);
        log("result: " + JSON.stringify(future.result));
        fs.readFile(filename, "utf-8", function(err, data) {
          if (err) {
            log ("Could not read back vCard from " + filename + ": " + JSON.stringify(err));
            resFuture.result = { returnValue: false };
          } else {
            log("Read vCard from " + filename + ": " + data);
            data = data.replace(/TEL;TYPE=CELL,VOICE/g,"TEL;TYPE=CELL");
            data = data.replace(/CELL;VOICE/g,"CELL");
            data = data.replace(/\nTYPE=:/g,"URL:"); //repair borked up URL thing. Omitting type here..
            if (input.contact && input.contact.note) {
              note = input.contact.note;
              if (version === "2.1") {
                note = quoted_printable_encode(note);
              }
              note = quote(note);
              log("Having note: " + note);
              data = data.replace("END:VCARD","NOTE:" + note + "\r\nEND:VCARD");
            }
            log("Modified data: " + data);
            resFuture.result = { returnValue: true, result: data };
          }
          fs.unlink(filename);
        });
      });
      
      return resFuture;
    },
    
    cleanUp: function (account) {
      var future = new Future();
      log("Contact cleanup called for " + tmpPath);
      fs.readdir(tmpPath, function (err, files) {
        var i, name = (account.name || "nameless") + "_", filename;
        for (i = 0; i < files.length; i += 1) {
          filename = files[i];
          log("Filename: " + filename);
          if (filename.indexOf(name) === 0) {
            log("Deleting " + filename);
            fs.unlink(tmpPath + filename);
          } else {
            log("Not deleting file " + filename + " in temp path. Match results: " + filename.indexOf(name));
          }
        }
        future.result = { returnValue: true };
      });
      log("Returninig future");
      return future;
    }
  }; //end of public interface
}());
