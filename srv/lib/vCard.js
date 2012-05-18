//JSLint stuff:
/*global PalmCall */

var vCard = (function () { 
  //public interface:
  return {
    parseVCard: function (vcard) {
      //TODO: we will first need to write the contact to file and then import that file. It's not possible otherwise. :(
      PalmCall.call("palm://com.palm.service.contacts", "importVCard", { filePath: "" }).then(
          function (future) {
              
      });
      return {};
    },
    
    generateVCard: function (contact) {
      //TODO: we will need to read the contact from file and then send that file. It's not possible otherwise. :(
      PalmCall.call("palm://com.palm.service.contacts", "vCardExportOne", { filePath: "" }).then(
        function (future) {
          
      });
    }
  }; //end of public interface
}());