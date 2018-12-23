function Util() {
}

Util.char8 = function(val) {
    if (val > 32 && val < 127) return String.fromCharCode(val);
    return '.';
};

Util.hex8 = function(val) {
    if (val < 0 || val > 255)  return "??";

    var hexstr = "0123456789ABCDEF";
    return hexstr[(val & 0xf0) >> 4] + hexstr[val & 0x0f];
};

Util.hex16 = function(val) {
    return Util.hex8((val & 0xff00) >> 8) + Util.hex8(val & 0x00ff);
};

Util.isWhitespace = function(c) {
    return c=='\t' || c == ' ';// this is too slow c.match(/\s/);
};

Util.toTargetEncoding = function(str, encoding) {
    return toEncoding(str, encoding);
};

Util.replaceExt = function(path, newext) {
    if (path.indexOf('.') === -1) {
        return path + newext;
    }
    return path.split('.').slice(0, -1).join('.') + newext;
}

Util.formatGutterBrief = function(addr, bytes)
{
    var width = 0;
    var hexes = " ";

    if (bytes.length > 0) {
        hexes = Util.hex16(addr) + "  ";
        var len = bytes.length > 4 ? 4 : bytes.length;
        for (let b = 0; b < len; b++) {
            hexes += Util.hex8(bytes[b]) + ' ';
            width += 3;
        }

        if (len < bytes.length) {
            // append ellipses if hex is too long for the gutter
            hexes += "…";
            width += 2; 
        }
        hexes += "                ".substring(width);
    }

    return hexes;
}

Util.formatGutterFull = function(addr, bytes)
{
    var hexes = "";
    var chars = "";

    if (bytes.length > 0) {
        var len = Math.floor((bytes.length + 15)/16) * 16;
        
        for (let b = 0; b < len; b++) {
            if ((b % 16) === 0) {
                hexes += Util.hex16(addr + b) + "  ";
                chars = "";
            }
            var ht = b < bytes.length ?
                Util.hex8(bytes[b]) : '  '; 
            hexes += ht + (b%16==7?'-':' ');

            chars += b < bytes.length ?
                Util.char8(bytes[b]) : ' ';

            if (((b + 1) % 16) === 0) {
                hexes += "  " + chars;
                hexes += "<br/>";
            }
        }
    }

    return hexes;
}

// Microsoft Edge compatibility polyfill
// https://github.com/KhaledElAnsari/String.prototype.trimStart
String.prototype.trimStart = String.prototype.trimStart ? String.prototype.trimStart : function() {
    if(String.prototype.trimLeft) {
        return this.trimLeft();
    } else if(String.prototype.trim) {
        var trimmed = this.trim();
        var indexOfWord = this.indexOf(trimmed);

        return this.slice(indexOfWord, this.length);
    }
};
