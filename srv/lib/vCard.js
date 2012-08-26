//JSLint stuff:
/*global Contacts, fs, log, Future, path */

var vCard = (function () { 
  var importer,
    exporter,
    tmpPath = "/tmp/syncml-contacts/", //don't forget trailling slash!!
    vCardIndex = 0;
  
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
          fs.mkdir(tmpPath, 0777, function (error) {
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
        currentContact;
      vCardIndex += 1;
      
      log("Writing vCard to file " + filename);
      log("vCard data: " + input.vCard);
      fs.writeFile(filename, input.vCard, "utf-8", function (err) {
        if (err) {
          log("Could not write vCard to file: " + filename + " Error: " + JSON.stringify(err));
        } else {
          log("Saved vCard to " + filename);
          //setup importer
          vCardImporter = new Contacts.vCardImporter({filePath: filename, importToAccountId: input.account.accountId});
          //do import:
          var future = vCardImporter.readVCard();
          future.then(function (f) {
            log("Future called: " + JSON.stringify(f.result));
            log("Test: " + JSON.stringify(f.result[0].getDBObject()));
            resFuture.result = {returnValue: true, results: [f.result[0].getDBObject()]};
            fs.unlink(filename);
          });
        }
      });
      
      return resFuture;
    },
    
    //input:
    //contactId
    generateVCard: function (input) {
      var resFuture = new Future(), 
        filename = tmpPath + (input.accountName || "nameless") + "_" + vCardIndex + ".vcf", 
        vCardExporter = new Contacts.VCardExporter({ filePath: filename }); //could set vCardVersion here to decide if 3.0 or 2.1, default will be 3.0... is that really necessary?
      vCardIndex += 1;
      
      Contacts.Utils.defineConstant("kind", "info.mobo.syncml.contact:1", Contacts.Person);
      log("Get contact " + input.contactId);
      vCardExporter.exportOne(input.contactId, false).then(function (future) {
        log("webOS saved vCard to " + filename);
        log("result: " + JSON.stringify(future.result));
        fs.readFile(filename, "utf-8", function(err, data) {
          if (err) {
            log ("Could not read back vCard from " + filename + ": " + JSON.stringify(err));
            resFuture.result = { returnValue: false };
          } else {
            log("Read vCard from " + filename + ": " + data);
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
