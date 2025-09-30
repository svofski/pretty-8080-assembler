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

Util.parseHexStrict = function(str)
{
    if (/^(0x)?[0123456789abcdef]+$/i.test(str)) {
        return parseInt(str, 16);
    }
    return NaN;
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


Util.getCharMetrics = function(el)
{
    const span = document.createElement("span");
    span.textContent = "M";
    span.style = "width: min-content";
    el.appendChild(span);
    const rect = span.getBoundingClientRect();
    el.removeChild(span);
    return {w: rect.width, h: rect.height};
};

Util.getClickRowCol = function(evt, element, padding_x = 0, padding_y = 0)
{
    const rect = element.getBoundingClientRect();
    const x = evt.clientX - rect.left + element.scrollLeft - padding_x;
    const y = evt.clientY - rect.top  + element.scrollTop - padding_y;
    const metrics = Util.getCharMetrics(element);

    const col = Math.floor(x / metrics.w);
    const row = Math.floor(y / metrics.h);

    return [row, col];
}

Util.get_computed_padding = function(el)
{
    const computedStyle = window.getComputedStyle(el);
    // container padding for exact offsets
    const padding = {
        top: parseInt(computedStyle.getPropertyValue('padding-top'), 10),
        right: parseInt(computedStyle.getPropertyValue('padding-right'), 10),
        bottom: parseInt(computedStyle.getPropertyValue('padding-bottom'), 10),
        left: parseInt(computedStyle.getPropertyValue('padding-left'), 10),
    };
    return padding;
}

Util.measureFunctionTime = function(func, ...args) {
  const start = performance.now();
  const result = func(...args); // Execute the function with its arguments
  const end = performance.now();
  const timeTaken = end - start;
  console.log(`Function '${func.name}' took ${timeTaken} ms to execute.`);
  return result; // Return the original function's result
}


Util.format_hexes = function(data, len, padding=12)
{
    let hexes = "";
    for (let i = 0; i < len; ++i) {
        hexes += Util.hex8(data[i]) + " ";
    }
    return hexes.padEnd(padding, " ");
}


Util.dump_line = function(addr, bytes)
{
    addr = addr & 0xfff0;
    let txt = Util.hex16(addr) + ": ";
    let chars = '';
    for (let n = 0; n < 16; ++n) {
        txt += Util.hex8(bytes[addr + n]);
        txt += n == 7 ? '-' : ' ';
        chars += Util.char8(bytes[addr+n]);
    }

    return txt + "   " + chars;

}

Util.url_without_query = function()
{
    return window.location.protocol + "//" + window.location.host + window.location.pathname;
};
