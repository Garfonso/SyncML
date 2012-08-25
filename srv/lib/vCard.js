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
    
    /*if (!input.vCard) {
      return new Future([]);
    }
    
    data = input.vCard.replace(/\r\n/g,"\n");
    if (!data) {
      data = input.vCard;
    }
    log ("Data: " + data);
    lines = data.split("\n");
    lines.push(null);
    
    var fileReader = {
      lines: lines,
      index: 0,
      peek: function () { log("PEEEK"); return this.lines[this.index+1]; },
      readLine: function() { log("REEAD"); this.index += 1; return this.lines[this.index-1]; },
      restartFile: function() { this.index = 0; }
    };
    
    vCardImporter = new Contacts.vCardImporter({filePath: filename, importToAccountId: input.account.accountId});
    vCardImporter.vCardFileReader = fileReader;
    vCardImporter.currentContact = contact;
    
    var future = vCardImporter.readVCard(function (params) { log("Callback called!"); log("Param: " + JSON.stringify(params)); return false;});
    future.then(function (f) {
      log("Future called: " + JSON.stringify(f.result));
      resFuture.result = {returnValue: true, results: f.result};
      //fs.unlink(filename);
    });*/
    
    
/*    currentLine = fileReader.readLine();
    while (currentLine !== null) {
			if (Contacts.vCardImporter._isLineBeginVCard(currentLine)) {
				//Contacts.vCardImporter._setCurrentContact({});
				currentLine = fileReader.readLine();
				continue;
			}

			if (Contacts.vCardImporter._isLineEndVCard(currentLine)) {
				currentContact = Contacts.vCardImporter._getCurrentContact();
				
				resFuture.result = [currentContact];

			} else {
				// Process the current line
				Contacts.vCardImporter._handleLine(currentLine, fileReader);
			}
			
			currentLine = fileReader.readLine();
		}*/

      
      return resFuture;
    },
    
    //input:
    //contactId
    generateVCard: function (input) {
      var resFuture = new Future(), 
        filename = tmpPath + (input.account.name || "nameless") + "_" + vCardIndex + ".vcf", 
        vCardExporter = new Contacts.VCardExporter({ filePath: filename }); //could set vCardVersion here to decide if 3.0 or 2.1, default will be 3.0... is that really necessary?
      vCardIndex += 1;
      
      vCardExporter.exportOne(input.contactId, false).then(function (future) {
        log("webOS saved vCard to " + filename);
        log("result: " + JSON.stringify(future.result));
        fs.readFile(filename, "utf-8", function(err, data) {
          if (err) {
            log ("Could not read back vCard from " + filename + ": " + JSON.stringify(err));
            resFuture.result = { returnValue: false };
          } else {
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
            //fs.unlink(tmpPath + filename);
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
