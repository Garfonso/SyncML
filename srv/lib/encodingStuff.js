//...
//...Base64 encode/decode functions. Plaxo expects Base64 encoding for username/password.
//...
/**
*  Base64 encode / decode
*  http://www.webtoolkit.info/
**/ 
var Base64 = {
  // private property
  _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
  // public method for encoding
  encode : function (input) {
      var output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;
      input = Base64._utf8_encode(input);
      while (i < input.length) {
          chr1 = input.charCodeAt(i);
          i += 1;
          chr2 = input.charCodeAt(i);
          i += 1;
          chr3 = input.charCodeAt(i);
          i += 1;

          enc1 = chr1 >> 2;
          enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
          enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
          enc4 = chr3 & 63;

          if (isNaN(chr2)) {
              enc3 = enc4 = 64;
          } 
          else if (isNaN(chr3)) {
              enc4 = 64;
          }

          output = output +
          this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
          this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
      }
      return output;
  },

  // public method for decoding
  decode : function (input) {
      var output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;

      input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

      while (i < input.length) {

          enc1 = this._keyStr.indexOf(input.charAt(i));
          i += 1;
          enc2 = this._keyStr.indexOf(input.charAt(i));
          i += 1;
          enc3 = this._keyStr.indexOf(input.charAt(i));
          i += 1;
          enc4 = this._keyStr.indexOf(input.charAt(i));
          i += 1;

          chr1 = (enc1 << 2) | (enc2 >> 4);
          chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
          chr3 = ((enc3 & 3) << 6) | enc4;

          output = output + String.fromCharCode(chr1);

          if (enc3 != 64) {
              output = output + String.fromCharCode(chr2);
          }
          if (enc4 != 64) {
              output = output + String.fromCharCode(chr3);
          }
      }
      output = Base64._utf8_decode(output);

      return output;
  },
  // private method for UTF-8 encoding
  _utf8_encode : function (string) {
      string = string.replace(/\r\n/g,"\n");
      var utftext = "", n, c;

      for (n = 0; n < string.length; n++) {
           c = string.charCodeAt(n);
           if (c < 128) {
              utftext += String.fromCharCode(c);
          }
          else if((c > 127) && (c < 2048)) {
              utftext += String.fromCharCode((c >> 6) | 192);
              utftext += String.fromCharCode((c & 63) | 128);
          }
          else {
              utftext += String.fromCharCode((c >> 12) | 224);
              utftext += String.fromCharCode(((c >> 6) & 63) | 128);
              utftext += String.fromCharCode((c & 63) | 128);
          }
       }
       return utftext;
  },
  // private method for UTF-8 decoding
  _utf8_decode : function (utftext) {
      var string = "", i = 0, c = 0, c2 = 0;

      while ( i < utftext.length ) {
          c = utftext.charCodeAt(i);
          if (c < 128) {
              string += String.fromCharCode(c);
              i++;
          }
          else if((c > 191) && (c < 224)) {
              c2 = utftext.charCodeAt(i+1);
              string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
              i += 2;
          }
          else {
              c2 = utftext.charCodeAt(i+1);
              c3 = utftext.charCodeAt(i+2);
              string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
              i += 3;
          }
      }
      return string;
  }
};

function decode_utf8(s)
{
  return decodeURIComponent(escape(s));
}

function encode_utf8(s)
{
  return unescape(encodeURIComponent(s));
}

function quoted_printable_decode(str) {
  // Convert a quoted-printable string to an 8 bit string  
  // 
  // version: 1109.2015
  // discuss at: http://phpjs.org/functions/quoted_printable_decode    // +   original by: Ole Vrijenhoek
  // +   bugfixed by: Brett Zamir (http://brett-zamir.me)
  // +   reimplemented by: Theriault
  // +   improved by: Brett Zamir (http://brett-zamir.me)
  // +   bugfixed by: Theriault    // *     example 1: quoted_printable_decode('a=3Db=3Dc');
  // *     returns 1: 'a=b=c'
  // *     example 2: quoted_printable_decode('abc  =20\r\n123  =20\r\n');
  // *     returns 2: 'abc   \r\n123   \r\n'
  // *     example 3: quoted_printable_decode('012345678901234567890123456789012345678901234567890123456789012345678901234=\r\n56789');    // *     returns 3: '01234567890123456789012345678901234567890123456789012345678901234567890123456789'
  // *    example 4: quoted_printable_decode("Lorem ipsum dolor sit amet=23, consectetur adipisicing elit");
  // *    returns 4: Lorem ipsum dolor sit amet#, consectetur adipisicing elit
  // Removes softline breaks
  var RFC2045Decode1 = /\=\r\n/gm,        // Decodes all equal signs followed by two hex digits
      RFC2045Decode2IN = /\=([0-9A-F]{2})/gim,
      // the RFC states against decoding lower case encodings, but following apparent PHP behavior
      // RFC2045Decode2IN = /=([0-9A-F]{2})/gm,
      RFC2045Decode2OUT = function (sMatch, sHex) {
        return String.fromCharCode(parseInt(sHex, 16));
      };
  return decode_utf8(str.replace(RFC2045Decode1, '').replace(RFC2045Decode2IN, RFC2045Decode2OUT));
}

function quoted_printable_encode (str) {
  str = encode_utf8(str);
  // +   original by: Theriault
  // +   improved by: Brett Zamir (http://brett-zamir.me)
  // +   improved by: Theriault
  // *     example 1: quoted_printable_encode('a=b=c');
  // *     returns 1: 'a=3Db=3Dc'
  // *     example 2: quoted_printable_encode('abc   \r\n123   \r\n');
  // *     returns 2: 'abc  =20\r\n123  =20\r\n'
  // *     example 3: quoted_printable_encode('0123456789012345678901234567890123456789012345678901234567890123456789012345');
  // *     returns 3: '012345678901234567890123456789012345678901234567890123456789012345678901234=\r\n5'
  // RFC 2045: 6.7.2: Octets with decimal values of 33 through 60 (bang to less-than) inclusive, and 62 through 126 (greater-than to tilde), inclusive, MAY be represented as the US-ASCII characters
  // PHP does not encode any of the above; as does this function.
  // RFC 2045: 6.7.3: Octets with values of 9 and 32 MAY be represented as US-ASCII TAB (HT) and SPACE characters, respectively, but MUST NOT be so represented at the end of an encoded line
  // PHP does not encode spaces (octet 32) except before a CRLF sequence as stated above. PHP always encodes tabs (octet 9). This function replicates PHP.
  // RFC 2045: 6.7.4: A line break in a text body, represented as a CRLF sequence in the text canonical form, must be represented by a (RFC 822) line break
  // PHP does not encode a CRLF sequence, as does this function.
  // RFC 2045: 6.7.5: The Quoted-Printable encoding REQUIRES that encoded lines be no more than 76 characters long. If longer lines are to be encoded with the Quoted-Printable encoding, "soft" line breaks must be used.
  // PHP breaks lines greater than 76 characters; as does this function.
  var hexChars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'],
  RFC2045Encode1IN = / \r\n|\r\n|[^!-<>-~ ]/gm,
  RFC2045Encode1OUT = function (sMatch) {
    // Encode space before CRLF sequence to prevent spaces from being stripped
    // Keep hard line breaks intact; CRLF sequences
    if (sMatch.length > 1) {
      return sMatch.replace(' ', '=20');
    }
    // Encode matching character
    var chr = sMatch.charCodeAt(0);
    return '=' + hexChars[((chr >>> 4) & 15)] + hexChars[(chr & 15)];
  },
  // Split lines to 75 characters; the reason it's 75 and not 76 is because softline breaks are preceeded by an equal sign; which would be the 76th character.
  // However, if the last line/string was exactly 76 characters, then a softline would not be needed. PHP currently softbreaks anyway; so this function replicates PHP.
  RFC2045Encode2IN = /.{1,72}(?!\r\n)[^=]{0,3}/g,
  RFC2045Encode2OUT = function (sMatch) {
    if (sMatch.substr(sMatch.length - 2) === '\r\n') {
      return sMatch;
    }
    return sMatch + '=\r\n';
  };
  str = str.replace(RFC2045Encode1IN, RFC2045Encode1OUT).replace(RFC2045Encode2IN, RFC2045Encode2OUT);
  // Strip last softline break
  return str.substr(0, str.length - 3);
}

function unquote(string) {
  if (string === undefined || string === null || typeof (string) !== "string") {
    return string;
  }
  string = string.replace(/\\\\/gmi, '\\');
  string = string.replace(/\\,/gmi, ',');
  string = string.replace(/\\;/gmi, ';');
  string = string.replace(/\\n/gmi, '\n');
  string = string.replace(/\\r/gmi, '\r');
  string = string.replace(/&amp;/gmi, "&");
  string = string.replace(/&lt;/gmi, "<");
  string = string.replace(/&gt;/gmi, ">");
  string = string.replace(/&quot;/gmi, "\"");
  string = string.replace(/&apos;/gmi, "'");
  return string;
}

function quote(string) {
  if (string === undefined || string === null || typeof (string) !== "string") {
    return string;
  }
  string = string.replace(/\\/gmi, "\\\\");
  string = string.replace(/,/gmi, "\\,");
  string = string.replace(/;/gmi, "\\;");
  string = string.replace(/\n/gmi, "\\n");
  string = string.replace(/\r/gmi, "\\r");
  string = string.replace(/&/gmi, "&amp;");
  string = string.replace(/</gmi, "&lt;");
  string = string.replace(/>/gmi, "&gt;");
  string = string.replace(/"/gmi, "&quot;");
  string = string.replace(/'/gmi, "&apos;");
  return string;
}
