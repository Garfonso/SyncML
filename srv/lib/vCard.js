//JSLint stuff:
/*global Contacts, fs, log, Future, path, MimeTypes, quoted_printable_decode, quoted_printable_encode, quote, Base64 */

var vCard = (function () { 
  var tmpPath = "/tmp/syncml-contacts/", //don't forget trailling slash!!
	    photoPath = "/media/internal/.syncml_photos/",
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
      var photo = false, tmp = false, finished = function () {
				if (tmp && photo) {
					var res = outerFuture.result;
					if (!res) {
						res = {};
					}
					res.vCard = true;
					outerFuture.result = res;
				}
      };
    
      //check that a temporary file path exists to save/read vcards to.
      path.exists(tmpPath, function(exists)  {
        if (!exists) {
          fs.mkdir(tmpPath, 0777, function (error) {
            if (error) {
              log("Could not create tmp-path, error: " + JSON.stringify(error));
            }
            tmp = true;
            finished();
          });
        } else {
          tmp = true;
          finished();
        }
      });
	  
	  //create path for photos:
	  path.exists(photoPath, function (exists) {
			if(!exists) {
				fs.mkdir(photoPath, 0777, function (error) {
					if (error) {
						log("Could not create photo-path, error: " + JSON.stringify(error));
					}
					photo = true;
					finished();
				});
			} else {
				photo = true;
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
        version = (input.serverData && input.serverData.serverType === MimeTypes.contacts.pref) ? "3.0" : "2.1", 
				photoData = "",
        emptyLine = /^[A-Za-z;\-_]*:[;]*$/;
      vCardIndex += 1;
      
      if (!input.vCard) {
        log("Empty vCard received.");
        return new Future({returnValue: false});
      }
      
      log("Writing vCard to file " + filename);
      log("vCard data: " + input.vCard);
			input.vCard = input.vCard.replace(/\=\r?\n/g, ''); //replace all =\n, those are newlines in datablocks (i.e. notes).
			input.vCard = input.vCard.replace(/\r?\n /g, ''); //replace all \n+space, those are newlines in datablocks (i.e. notes).
			if (input.vCard.indexOf("VERSION:3.0") > -1) {
				//log("Found version 3.0 vCard, changing to 3.0 from " + version);
				version = "3.0";
			} else  if (input.vCard.indexOf("VERSION:2.1") > -1) {
				//log("Found version 2.1 vCard, changing to 2.1 from " + version);
				version = "2.1";			
			}
      lines = input.vCard.split(/\r?\n/);
      data = [];
      for (i = 0; i < lines.length; i += 1) {
        currentLine = lines[i];
				log("CurrentLine: " + currentLine);
				//check for start of photo mode
				if (currentLine.indexOf("PHOTO") > -1) {
					log("got photo...");
					photoData = currentLine.substring(currentLine.indexOf(":") + 1);
					log("PhotoData: " + photoData);
					continue; //skip photo init line..
				}
				
				if (!emptyLine.test(currentLine)) {
					if (version === "2.1") {
						log("Decode, because version " + version);
						currentLine = quoted_printable_decode(currentLine);
						currentLine = currentLine.replace(/\r?\n=?/g,'\\n');
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
            var obj = f.result[0].getDBObject(), decodedPhoto;
            log("Contact: " + JSON.stringify(obj));
            //cleanUpEmptyFields(obj);
            //log("Contact after cleanup: " + JSON.stringify(obj));
            fs.unlink(filename);
						
						log("PhotoData Length: " + photoData.length);
						if (photoData.length > 0) { //got a photo!! :)
							log("Writing photo!");
							//decodedPhoto = Base64.decode(photoData);
							var buff = new Buffer(photoData, 'base64');
							filename = photoPath + (input.account.name || "nameless") + obj.name.givenName + obj.name.familyName + ".jpg";
							log("writing photo to: " + filename);
							log("Base64 photo data: " + photoData);
							fs.writeFile(filename, buff, function (err) {
								if (err) {
									log("Could not write photo to file: " + filename + " Error: " + JSON.stringify(err));
								}
							});
							obj.photos.push({localPath: filename, primary: false, type: "type_big"});
							obj.photos.push({localPath: filename, primary: false, type: "type_square"});
						}
						
						resFuture.result = {returnValue: true, results: [obj]};
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
