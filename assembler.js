/*jshint sub:true*/ 		// object['prop'] is ok 
/*jshint evil: true */ 		// eval is okay
/*globals self: false */ 	// self is defined by worker scope

"use strict";
//
// Pretty 8080 Assembler
// 
// Send comments to svofski at gmail dit com 
// 
// Copyright (c) 2009 Viacheslav Slavinsky
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
//
// Translation help:
// Leonid Kirillov, Alexander Timoshenko, Upi Tamminen,
// Cristopher Green, Nard Awater, Ali Asadzadeh,
// Guillermo S. Romero, Anna Merkulova, Stephan Henningsen
// 
// Revison Log
// Rev.A: Initial release
// Rev.B: A lot of fixes to compile TINIDISK.ASM by Dr. Li-Chen Wang
// Rev.C: Performance optimizations and cleanup, labels->hash
// Rev.D: More syntax fixes; opera navigation and Back Button Toolbar
// Rev.E: Navigation to label references (backref menu)
//        Nice labels table
//        Some Opera-related fixes
// Rev.F: fixed '.' and semi-colon in db
//        tab scroll fixed
// Rev.G: $ can now work as hex prefix
// Rev.H: Fixed spaces in reg-reg, .binfile, .hexfile
// Rev.I: Fixed bug in evaluation of hex literals ending with d
// Rev.J: Backport from offline version: register highlighting
// Rev.K: Target encodings support
//
// TODO: evaluation should ignore precedence, it's all left-to-right
//

importScripts('encodings.js');
importScripts('util.js');
importScripts('tape.js');

function Assembler() {
    this.debug = false;
    this.binFileName = 'test.com';
    this.hexFileName = 'test.hex';
    this.downloadFormat = 'bin';
    this.tapeFormat = 'rk-bin';
    this.objCopy = 'gobjcopy';
    this.postbuild = '';
    this.doHexDump = true;
    this.doIntelHex = true;
    this.targetEncoding = 'koi8-r';


    this.LabelsCount = 0;
    this.labels = {};

    this.resolveTable = []; // label negative id, resolved address
    this.mem = [];
    this.org = undefined;
    this.textlabels= [];
    this.references = [];
    this.errors = [];
    this.regUsage = [];
    this.listingText = "";
}

// -- utility stuffs --
Assembler.rpmap = {"h":"l", "d":"e"};

// -- Assembler --

Assembler.ops0 = {
    "nop":  0x00,
    "hlt":	0x76,
    "ei":	0xfb,
    "di":	0xf3,
    "sphl":	0xf9,
    "xchg":	0xeb,
    "xthl":	0xe3,
    "daa":	0x27,
    "cma":	0x2f,
    "stc":	0x37,
    "cmc":	0x3f,
    "rlc":	0x07,
    "rrc":	0x0f,
    "ral":	0x17,
    "rar":	0x1f,
    "pchl":	0xe9,
    "ret":	0xc9,
    "rnz":	0xc0,
    "rz":	0xc8,
    "rnc":	0xd0,
    "rc":	0xd8,
    "rpo":	0xe0,
    "rpe":	0xe8,
    "rp":	0xf0,
    "rm":	0xf8,
};

Assembler.opsIm16 = {
    "lda":	0x3a,
    "sta":	0x32,
    "lhld":	0x2a,
    "shld":	0x22,
    "jmp":	0xc3,
    "jnz":	0xc2,
    "jz":	0xca,
    "jnc":	0xd2,
    "jc":	0xda,
    "jpo":	0xe2,
    "jpe":	0xea,
    "jp":	0xf2,
    "jm":	0xfa,
    "call":	0xcd,
    "cnz":	0xc4,
    "cz":	0xcc,
    "cnc":	0xd4,
    "cc":	0xdc,
    "cpo":	0xe4,
    "cpe":	0xec,
    "cp":	0xf4,
    "cm":	0xfc,
};

// lxi rp, im16
Assembler.opsRpIm16 = {
    "lxi":	"01"	// 00rp0001, bc=00, de=01,hl=10, sp=11
};

// adi 33, out 10
Assembler.opsIm8 = {
    "adi": 	0xc6,
    "aci": 	0xce,
    "sui":	0xd6,
    "sbi":	0xde,
    "ani":	0xe6,
    "xri":	0xee,
    "ori":	0xf6,
    "cpi":	0xfe,
    "in":	0xdb,
    "out": 	0xd3,
};

Assembler.opsRegIm8 = {
    "mvi": 	0x06,
};

Assembler.opsRegReg = {
    "mov": 	0x40,
};

Assembler.opsReg = {
    "add": 0x80, // regsrc
    "adc": 0x88,
    "sub": 0x90,
    "sbb": 0x98,
    "ana": 0xa0,
    "xra": 0xa8,
    "ora": 0xb0,
    "cmp": 0xb8,

    "inr": 0x04, // regdst (<<3)
    "dcr": 0x05,
};

// these are the direct register ops, regdst
Assembler.opsRegDst = new Array("inr", "dcr");

Assembler.opsRp = {
    "ldax": 0x0a, // rp << 4 (only B, D)
    "stax": 0x02, // rp << 4 (only B, D)
    "dad":  0x09, // rp << 4
    "inx":  0x03, // rp << 4
    "dcx":  0x0b, // rp << 4
    "push": 0xc5, // rp << 4
    "pop":  0xc1, // rp << 4
};

Assembler.prototype.clearLabels = function() {
    this.LabelsCount = 0;
    this.labels = [];
};

Assembler.DecimalDigits = "0123456789";

Assembler.prototype.resolveNumber = function(identifier) {
    if (identifier === undefined || identifier.length === 0) return;

    var first = identifier[0];
    if ((first === "'" || first === '"') && identifier.length === 3) {
        return 0xff & identifier.charCodeAt(1);
    }

    if (first === '$') {
        let test = Number("0x" + identifier.substr(1, identifier.length-1));
        return test;
    }

    if (Assembler.DecimalDigits.indexOf(identifier[0]) != -1) {
        let test = Number(identifier);
        if (!isNaN(test)) {
            return test.valueOf();
        }

        var suffix = identifier[identifier.length-1].toLowerCase();
        switch (suffix) {
            case 'd':
                test = parseInt(identifier.substr(0, identifier.length-1));
                if (!isNaN(test)) {
                    return test;
                }
                break;
            case 'h':
                test = parseInt(identifier.substr(0, identifier.length-1), 16);
                if (!isNaN(test)) {
                    return test;
                }
                break;
            case 'b':
                test = parseInt(identifier.substr(0, identifier.length-1), 2);
                if (!isNaN(test)) {
                    return test;
                }
                break;
            case 'q':
                var oct = identifier.substr(0, identifier.length-1);
                for (var i = oct.length; --i >= 0;) {
                    if (oct[i] == '8' || oct[i] == '9') return -1;
                }
                var octaltest = parseInt(oct, 8);
                if (!isNaN(octaltest)) {
                    return octaltest;
                }
                break;
        }
    }
    return -1;
};

Assembler.prototype.referencesLabel = function(identifier, linenumber) {
    if (this.references[linenumber] === undefined) {
        this.references[linenumber] = identifier.toLowerCase();
    }
};

Assembler.prototype.markLabel = function(identifier_, address, linenumber, override, updateReference) {
    var id = identifier_.replace(/\$([0-9a-fA-F]+)/, '0x$1'); 		// make sure that $ in hexes is replaced
    id = id.replace(/(^|[^'])(\$|\.)/, ' '+address+' '); 	// substitute $/. with address
    var result = this.resolveNumber(id.trim());
    if (result === -1) {
        if (linenumber === undefined) {
            this.LabelsCount++;
            address = -1 - this.LabelsCount;
        }

        id = id.toLowerCase();

        var found = this.labels[id];
        if (found !== undefined) {
            if (address >= 0) {
                this.resolveTable[-found] = address;
            } else {
                address = found;
            }
        }

        if (!found || override) {
            this.labels[id] = address;
        }

        if (linenumber !== undefined) {
            this.textlabels[linenumber] = id;
        }
        if (updateReference) {
            this.referencesLabel(identifier_ /* sic! */, linenumber);
        }
        result = address;
    }			
    return result;
};

Assembler.prototype.setmem16 = function(addr, immediate) {
    if (immediate >= 0) {
        this.mem[addr] = immediate & 0xff;
        this.mem[addr+1] = immediate >> 8;
    } else {
        this.mem[addr] = immediate;
        this.mem[addr+1] = immediate;
    }
};

Assembler.prototype.setmem8 = function(addr, immediate) {
    this.mem[addr] = immediate < 0 ? immediate : immediate & 0xff;
};

Assembler.parseRegisterPair = function(s) {
    if (s !== undefined) {
        s = s.split(';')[0].toLowerCase();
        if (s == 'b' || s == 'bc') return 0;
        if (s == 'd' || s == 'de') return 1;
        if (s == 'h' || s == 'hl') return 2;
        if (s == 'sp'|| s == 'psw' || s == 'a') return 3;
    }
    return -1;
};

Assembler.registers = "bcdehlma";
// b=000, c=001, d=010, e=011, h=100, l=101, m=110, a=111
Assembler.parseRegister = function(s) {
    if (s === undefined) return -1;
    if (s.length > 1) return -1;
    s = s.toLowerCase();
    return Assembler.registers.indexOf(s[0]);
};


Assembler.prototype.tokenDBDW = function(s, addr, length, linenumber) {
    s = s.trim();
    if (s.length === 0) return 0;
    var size = -1;
    var n = this.markLabel(s, addr);
    this.referencesLabel(s, linenumber);

    var len = length ? length : 1;
    if (len === 1 && n < 256) {
        this.setmem8(addr, n);
        size = 1;
    } else if (len === 2 && n < 65536) {
        this.setmem16(addr, n); 
        size = 2;
    }

    return size;
};

Assembler.prototype.tokenString = function(s, addr, linenumber) {
    for (var i = 0; i < s.length; i+=1) {
        this.setmem8(addr+i, s.charCodeAt(i));
    }
    return s.length;
};

Assembler.prototype.parseDeclBase64 = function(args, addr, linenumber) {
    var text = args.slice(1).join(' ');
    var raw = atob(text);
    var length = raw.length;
    for (var i = 0; i < length; i += 1) {
        this.setmem8(addr + i, raw.charCodeAt(i));
    }
    return length;
};

Assembler.prototype.parseDeclDB = function(args, addr, linenumber, dw) {
    var text = args.slice(1).join(' ');
    var mode = 0;
    var cork = '\0';
    var nbytes = 0;
    var arg_start = 0;
    var i, end_i;
    for (i = 0, end_i = text.length; i < end_i; i+=1) {
        var char = text[i];
        switch (mode) {
            case 0:
                if (char === '"' || char === "'") {
                    mode = 1; 
                    cork = char;
                    arg_start = i + 1;
                    break;
                } else if (char === ',') {
                    let len = this.tokenDBDW(text.substring(arg_start, i), addr + nbytes, dw, linenumber);
                    if (len < 0) {
                        return -1;
                    }
                    nbytes += len;
                    arg_start = i + 1;
                } else if (char === ';') {
                    i = text.length;
                    break;
                } 
                break;
            case 1:
                if (char === cork) {
                    cork = '\0';
                    mode = 0;
                    let len = this.tokenString(text.substring(arg_start, i), addr+nbytes, linenumber);
                    if (len < 0) {
                        return -1;
                    }
                    nbytes += len;
                    arg_start = i + 1;
                }
                break; 
        }
    }
    if (mode === 1) return -1;    // unterminated string
    var len = this.tokenDBDW(text.substring(arg_start, i), addr+nbytes, dw, linenumber);
    if (len < 0) return -1;
    nbytes += len;

    return nbytes;
};

Assembler.prototype.getExpr = function(arr) {
    var ex = arr.join(' ').trim();
    if (ex[0] == '"' || ex[0] == "'") {
        return ex;
    }
    return ex.split(';')[0];
};

Assembler.prototype.useExpr = function(s, addr, linenumber) {
    var expr = this.getExpr(s);
    if (expr === undefined || expr.trim().length === 0) return false;

    var immediate = this.markLabel(expr, addr);
    this.referencesLabel(expr, linenumber);
    return immediate;
};

Assembler.prototype.setNewEncoding = function(encoding) {
    try {
        var encoded = Util.toTargetEncoding('test', encoding);
        this.targetEncoding = encoding;
    } catch(err) {
        return -1;
    }
    return -100000;
};

Assembler.prototype.parseInstruction = function(s, addr, linenumber) {
    var parts = s.split(/\s+/);

    for (let i = 0; i < parts.length; i++) {
        if (parts[i][0] == ';') {
            parts.length = i;
            break;
        }
    }

    var labelTag;
    var immediate;
    var regusage;
    var result = 0;

    for (;parts.length > 0;) {
        var opcs;
        var mnemonic = parts[0].toLowerCase();

        if (mnemonic.length === 0) {
            parts = parts.slice(1);
            continue;
        }

        // no operands
        if ((opcs = Assembler.ops0[mnemonic]) !== undefined) {
            this.mem[addr] = opcs;
            if (mnemonic == "xchg") {
                regusage = ['#', 'h', 'l', 'd', 'e'];
            } else if (mnemonic == "sphl" || mnemonic == "xthl") {
                regusage = ['#', 'sp', 'h'];
            } else if (["ral", "rar", "rla", "rra", "cma"].indexOf(mnemonic) != -1) {
                regusage = ['#', 'a'];
            }

            result = 1;
            break;
        }

        // immediate word
        if ((opcs = Assembler.opsIm16[mnemonic]) !== undefined) {
            this.mem[addr] = opcs;

            immediate = this.useExpr(parts.slice(1), addr, linenumber);

            this.setmem16(addr+1, immediate);

            if (["lhld", "shld"].indexOf(mnemonic) != -1) {
                regusage = ['#', 'h', 'l'];
            }
            else if (["lda", "sta"].indexOf(mnemonic) != -1) {
                regusage = ['#', 'a'];
            }

            result = 3;
            break;
        }

        // register pair <- immediate
        if ((opcs = Assembler.opsRpIm16[mnemonic]) !== undefined) {
            let subparts = parts.slice(1).join(" ").split(",");
            if (subparts.length < 2) return -3;
            let rp = Assembler.parseRegisterPair(subparts[0]);
            if (rp == -1) return -3;

            this.mem[addr] = opcs | (rp << 4);

            immediate = this.useExpr(subparts.slice(1), addr, linenumber);

            this.setmem16(addr+1, immediate);
            regusage = ['@'+subparts[0].trim()];
            if (["h","d"].indexOf(subparts[0].trim()) != -1) {
                regusage.push('#',
                        Assembler.rpmap[subparts[0].trim()]);
            }
            result = 3;
            break;
        }

        // immediate byte		
        if ((opcs = Assembler.opsIm8[mnemonic]) !== undefined) {
            this.mem[addr] = opcs;
            immediate = this.useExpr(parts.slice(1), addr, linenumber);
            this.setmem8(addr+1, immediate);

            if (["sui", "sbi", "xri", "ori", "ani", "adi", "aci", "cpi"].indexOf(mnemonic) != -1) {
                regusage = ['#', 'a'];
            }

            result = 2;
            break;
        }

        // single register, im8
        if ((opcs = Assembler.opsRegIm8[mnemonic]) !== undefined) {
            let subparts = parts.slice(1).join(" ").split(",");
            if (subparts.length < 2) {
                result = -2;
                break;
            }
            var reg = Assembler.parseRegister(subparts[0]);
            if (reg == -1) {
                result = -2;
                break;
            }

            this.mem[addr] = opcs | reg << 3;

            immediate = this.useExpr(subparts.slice(1), addr, linenumber);

            this.setmem8(addr+1, immediate);

            regusage = [subparts[0].trim()];

            result = 2;			
            break;
        }

        // dual register (mov)
        if ((opcs = Assembler.opsRegReg[mnemonic]) !== undefined) {
            let subparts = parts.slice(1).join(" ").split(",");
            if (subparts.length < 2) {
                result = -1;
                break;
            }
            let reg1 = Assembler.parseRegister(subparts[0].trim());
            let reg2 = Assembler.parseRegister(subparts[1].trim());
            if (reg1 == -1 || reg2 == -1) {
                result = -1;
                break;
            }
            this.mem[addr] = opcs | reg1 << 3 | reg2;
            regusage = [subparts[0].trim(), subparts[1].trim()];
            result = 1;
            break;
        }

        // single register
        if ((opcs = Assembler.opsReg[mnemonic]) !== undefined) {
            let reg = Assembler.parseRegister(parts[1]);
            if (reg == -1) {
                result = -1;
                break;
            }

            if (Assembler.opsRegDst.indexOf(mnemonic) != -1) {
                reg <<= 3;
            }
            this.mem[addr] = opcs | reg;

            regusage = [parts[1].trim()];
            if (["ora", "ana", "xra", "add", "adc", "sub", "sbc", "cmp"].indexOf(mnemonic) != -1) {
                regusage.push('#', 'a');
            }

            result = 1;
            break;
        }

        // single register pair
        if ((opcs = Assembler.opsRp[mnemonic]) !== undefined) {
            let rp = Assembler.parseRegisterPair(parts[1]);
            if (rp == -1) {
                result = -1;
                break;
            }
            if (["ldax","stax"].indexOf(mnemonic) != -1 && rp > 1) {
                result = -1;
                break;
            }
            this.mem[addr] = opcs | rp << 4;

            regusage = ['@'+parts[1].trim()];
            if (mnemonic == "dad") {
                regusage.push('#', 'h', 'l');
            } else if (["inx", "dcx"].indexOf(mnemonic) != -1) {
                if (["h","d"].indexOf(parts[1].trim()) != -1) {
                    regusage.push('#', Assembler.rpmap[parts[1].trim()]);
                }
            }
            result = 1;
            break;
        }		

        // rst
        if (mnemonic == "rst") {
            let n = this.resolveNumber(parts[1]);
            if (n >= 0 && n < 8) {
                this.mem[addr] = 0xC7 | n << 3;
                result = 1;
            } else {
                result = -1;
            }
            break;
        }

        if (mnemonic == ".org" || mnemonic == "org") {
            let n = this.evaluateExpression(parts.slice(1).join(' '), addr);
            if (n >= 0) {
                if (this.org === undefined || n < this.org) {
                    this.org = n;
                }
                result = -100000-n;
            } else {
                result = -1;
            }
            break;
        }

        if (mnemonic == ".binfile") {
            if (parts[1] !== undefined && parts[1].trim().length > 0) {
                this.binFileName = parts[1];
            }
            result = -100000;
            break;
        }

        if (mnemonic == ".hexfile") {
            if (parts[1] !== undefined && parts[1].trim().length > 0) {
                this.hexFileName = parts[1];
            }
            result = -100000;
            break;
        }

        if (mnemonic == ".download") {
            if (parts[1] !== undefined && parts[1].trim().length > 0) {
                this.downloadFormat = parts[1].trim();
            }
            result = -100000;
            break;
        }

        if (mnemonic == ".tape") {
            if (parts[1] !== undefined && parts[1].trim().length > 0) {
                this.tapeFormat = parts[1].trim();
                var test = new TapeFormat(this.tapeFormat);
                if (test.format) {
                    result = -100000;
                    break;
                }
            }
        }

        if (mnemonic == ".objcopy") {
            this.objCopy = parts.slice(1).join(' '); 
            result = -100000;
            break;
        }

        if (mnemonic == ".postbuild") {
            this.postbuild = parts.slice(1).join(' ');
            result = -100000;
            break;
        }

        if (mnemonic == ".nodump") {
            this.doHexDump = false;
            result = -100000;
            break;
        }
        if (mnemonic == ".nohex") {
            this.doIntelHex = false;
            result = -100000;
            break;
        }

        // assign immediate value to label
        if (mnemonic == ".equ" || mnemonic == "equ") {
            if (labelTag === undefined) return -1;
            let value = this.evaluateExpression(parts.slice(1).join(' '), addr);
            this.markLabel(labelTag, value, linenumber, true);
            result = 0;
            break;
        }

        if (mnemonic == ".encoding") {
            let encoding = parts.slice(1).join(' ');	
            return this.setNewEncoding(encoding);
        }

        if (mnemonic == 'cpu' ||
                mnemonic == 'aseg' ||
                mnemonic == '.aseg') return 0;

        if (mnemonic == 'db' || mnemonic == '.db' || mnemonic == 'str') {
            result = this.parseDeclDB(parts, addr, linenumber, 1);
            break;
        }
        if (mnemonic == 'dw' || mnemonic == '.dw') {
            result = this.parseDeclDB(parts, addr, linenumber, 2);
            break;
        }
        if (mnemonic == 'ds' || mnemonic == '.ds') {
            let size = this.evaluateExpression(parts.slice(1).join(' '), addr);
            if (size >= 0) {
                for (let i = 0; i < size; i++) {
                    this.setmem8(addr+i, 0);
                }
                result = size;
            } else {
                result = -1;
            }
            break;
        }
        if (mnemonic == 'db64') {
            result = this.parseDeclBase64(parts, addr, linenumber);
            break;
        }

        if (parts[0][0] == ";") {
            return 0;
        }

        // nothing else works, it must be a label
        if (labelTag === undefined) {
            var splat = mnemonic.split(':');
            labelTag = splat[0];
            this.markLabel(labelTag, addr, linenumber);

            parts.splice(0, 1, splat.slice(1).join(':'));
            continue;
        }

        this.mem[addr] = -2;
        result = -1; // error
        break;
    }

    if (result > 0) {
        this.regUsage[linenumber] = regusage;
    }
    return result;
};


// -- output --

Assembler.prototype.labelList = function() {
    const s = "                        ";
    const f = function(label, addr) {
        var result = label.substring(0, s.length);
        if (result.length < s.length) {
            result += s.substring(result.length);
        }
        result += addr < 0 ? "????" : Util.hex16(addr);
        return result;
    };

    var sorted = [];
    for (let i in this.labels) {
        sorted[sorted.length] = i;
    }
    sorted.sort();

    var result = "<pre>Labels:</pre>";
    result += '<div class="hordiv"></div>';
    result += '<pre class="labeltable">';
    var col = 1;
    for (var j = 0; j < sorted.length; j++) {
        let i = sorted[j];
        var label = this.labels[i];

        // hmm? 
        if (label === undefined) continue;
        if (i.length === 0) continue; // resolved expressions
        var resultClass = (col%4 === 0 ? 't2' : 't1');
        if (label < 0) resultClass += ' errorline';

        result += "<span class='" + resultClass +  
            "' onclick=\"return gotoLabel('"+i+"');\"";
        result += ">";
        result += f(i,label);
        result += "</span>";
        if (col % 4 === 0) result += "<br/>";
        col++;
    }
    result += "</pre>";

    return result;
};

Assembler.prototype.dumpspan = function(org, mode) {
    var result = "";
    var nonempty = false;
    var conv = mode ? Util.char8 : Util.hex8;
    for (var i = org; i < org+16; i++) {
        if (this.mem[i] !== undefined) nonempty = true;
        if (mode == 1) {
            result += conv(this.mem[i]);
        } else {
            result += (i > org && i%8 === 0) ? "-" : " ";
            if (this.mem[i] === undefined) {
                result += '  ';
            }
            else if (this.mem[i] < 0) {
                result += '<span class="errorline">' + conv(this.mem[i]) + '</span>';
            } else {
                result += conv(this.mem[i]);
            }
        }
    }

    return nonempty ? result : false;
};

Assembler.prototype.dump = function() {
    //var org;
    //for (org = 0; org < this.mem.length && this.mem[org] === undefined; org++);
    var org = this.org;

    if (org % 16 !== 0) org = org - org % 16;

    var result = "<pre>Memory dump:</pre>";
    result += '<div class="hordiv"></div>';
    var lastempty;

    var printline = 0;

    for (var i = org, end_i = this.mem.length; i < end_i; i += 16) {
        var span = this.dumpspan(i, 0);
        if (span || !lastempty) {
            result += '<pre ' + 'class="d' + (printline++%2) + '"';
            result += ">";
        }
        if (span) {
            result += Util.hex16(i) + ": ";
            result += span;
            result += '  ';
            result += this.dumpspan(i, 1);
            result += "</pre><br/>";
            lastempty = false;
        } 
        if (!span && !lastempty) {
            result += " </pre><br/>";
            lastempty = true;
        }
    }

    return result;
};

Assembler.prototype.intelHex = function() {
    var i, j;
    var line = "";
    var r = "";
    var pureHex = "";
    r += "<pre>Intel HEX:</pre>";
    r += '<div class="hordiv"></div>';

    r += "<pre>";
    r += 'cat &gt;' + this.hexFileName + ' &lt;&lt;X<br/>';
    //r += 'ed<br>i<br>';
    for (i = 0; i < this.mem.length;) {
        for (j = i; j < this.mem.length && this.mem[j] === undefined; j++);
        i = j;
        if (i >= this.mem.length) break; 

        line = ":";

        var cs = 0;

        var rec = "";
        for (j = 0; j < 32 && this.mem[i+j] !== undefined; j++) {
            if (this.mem[i+j] < 0) this.mem[i+j] = 0;
            rec += Util.hex8(this.mem[i+j]); 
            cs += this.mem[i+j];
        }

        cs += j; line += Util.hex8(j);   // byte count
        cs += (i>>8)&255; cs+=i&255; line += Util.hex16(i);  // record address
        cs += 0; line += "00";      // record type 0, data
        line += rec;

        cs = 0xff&(-(cs&255));
        line += Util.hex8(cs);
        pureHex += line + '|n';
        r += line + '<br/>';

        i += j;
    }
    r += ':00000001FF<br/>';
    pureHex += ':00000001FF\n';
    //r += '.<br>w ' + this.hexFileName +'<br>q<br>';
    r += 'X<br/>';
    r += this.objCopy + ' -I ihex ' + this.hexFileName + ' -O binary ' + 
        this.binFileName + '<br/>';
    if (this.postbuild.length > 0) {
        r += this.postbuild + '<br/>';
    }
    r += '</pre>';

    this.hexText = pureHex;
    return r;
};

Assembler.prototype.getLabel = function(l) {
    return this.labels[l.toLowerCase()];
};

Assembler.prototype.processRegUsage = function(instr, linenumber) {
    if (this.regUsage[linenumber] !== undefined) {
        // check indirects
        var indirectsidx = this.regUsage[linenumber].indexOf('#');
        var indirects = [];
        var directs = [];
        if (indirectsidx != -1) {
            indirects = this.regUsage[linenumber].slice(indirectsidx + 1);
            directs = this.regUsage[linenumber].slice(0, indirectsidx);
        } else {
            directs = this.regUsage[linenumber];
        }

        if (indirects.length > 0) {
            let regs = [''].concat(indirects).join("','rg").substr(2) + "'";

            let rep1 = '<span ' + 
                'onmouseover="return rgmouseover([' + regs + ']);" ' +
                'onmouseout="return rgmouseout([' + regs + ']);" ' +
                '>$1</span>';
            instr = instr.replace(/(\w+)/, rep1);
        }

        if (directs.length == 2) {
            // reg, reg 
            let s1 = "rg" + directs[0];
            let s2 = "rg" + directs[1];
            let rep1 = '<span class="' + s1 + '" ' + 
                'onmouseover="return rgmouseover(\'' + s1 + '\');" ' +
                'onmouseout="return rgmouseout(\'' + s1 + '\');" ' +
                '>$2</span>';
            let rep2 = '<span class="' + s2 + '" ' + 
                'onmouseover="return rgmouseover(\'' + s2 + '\');" ' +
                'onmouseout="return rgmouseout(\'' + s2 + '\');" ' +
                '>$3</span>';
            let replace = '$1' + rep1 + ', ' + rep2;
            instr=instr.replace(/(.+\s)([abcdehlm])\s*,\s*([abcdehlm])/, replace);
        } else if (directs.length == 1) {
            let rpname = directs[0];
            if (rpname[0] == '@') {
                rpname = rpname.substring(1);
                // register pair
                let s1 = "rg" + rpname;
                let rep1 = '<span class="' + s1 + '" ' + 
                    'onmouseover="return rgmouseover(\'' + s1 + '\');" ' +
                    'onmouseout="return rgmouseout(\'' + s1 + '\');" ' +
                    '>$2</span>';
                let replace = '$1'+rep1;
                instr=instr.replace(/([^\s]+[\s]+)([bdh]|sp)/, replace);
            } else {
                // normal register
                let s1 = "rg" + rpname;
                let rep1 = '<span class="' + s1 + '" ' + 
                    'onmouseover="return rgmouseover(\'' + s1 + '\');" ' +
                    'onmouseout="return rgmouseout(\'' + s1 + '\');" ' +
                    '>$2</span>';
                let replace = '$1'+rep1;
                instr=instr.replace(/([^\s]+[\s]+)([abcdehlm])/, replace);
            }
        }
    }

    return instr;
};

Assembler.prototype.listing = function(text,lengths,addresses) { 
    var result = [];
    var addr = 0;
    for(var i = 0, end_i = text.length; i < end_i; i += 1) {
        var labeltext = "";
        var remainder = text[i];
        var comment = '';
        var parts = text[i].split(/[\:\s]/);
        if (parts.length > 1) {
            if (this.getLabel(parts[0]) != -1 && parts[0].trim()[0] != ';') {
                labeltext = parts[0];
                remainder = text[i].substring(labeltext.length);
            }
        }

        var semicolon = remainder.indexOf(';');
        if (semicolon != -1) {
            comment = remainder.substring(semicolon);
            remainder = remainder.substring(0, semicolon);
        }

        // truncate awfully long lines in the listing before processRegUsage
        if (remainder.length > 128) {
            remainder = remainder.substring(0, 128) + "&hellip;";
        }

        // processRegUsage will add tags to remainder so it cannot be truncated after this
        remainder = this.processRegUsage(remainder, i);

        var id = "l" + i;
        var labelid = "label" + i;
        var remid = "code" + i;

        var hexes = "";
        var unresolved = false;
        var width = 0;

        var len = lengths[i] > 4 ? 4 : lengths[i];
        for (let b = 0; b < len; b++) {
            hexes += Util.hex8(this.mem[addresses[i]+b]) + ' ';
            width += 3;
            if (this.mem[addresses[i]+b] < 0) unresolved = true;
        }
        hexes += "                ".substring(width);

        result.push('<pre id="' + id + '"');

        if (unresolved || this.errors[i] !== undefined) {
            result.push(' class="errorline" ');
        }

        result.push('>',
                '<span class="adr">' + (lengths[i] > 0 ? Util.hex16(addresses[i]) : "") + "</span>",
                '\t',
                hexes);

        if (labeltext.length > 0) {
            result.push('<span class="l" id="' + labelid + '"' +
                    ' onmouseover="return mouseovel('+i+');"' + 
                    ' onmouseout="return mouseout('+i+');"' +
                    '>' + labeltext + '</span>');
        }
        var padding = '';
        for (var b = 0; b < remainder.length && Util.isWhitespace(remainder[b]); b++) {
            padding += remainder[b]; // copy to preserve tabs
        }
        result.push(padding);
        remainder = remainder.substring(b);
        if (remainder.length > 0) {
            result.push('<span id="' + remid + '"' +
                    ' onmouseover="return mouseover('+i+');"' + 
                    ' onmouseout="return mouseout('+i+');"' +
                    '>' + remainder + '</span>');
        }

        if (comment.length > 0) {
            result.push('<span class="cmt">' + comment + '</span>');
        }

        // display only first and last lines of db thingies
        if (len < lengths[i]) {
            result.push('<br/>\t.&nbsp;.&nbsp;.&nbsp;<br/>');
            var subresult = '';
            for (var subline = 1; subline*4 < lengths[i]; subline++) {
                subresult = '';
                subresult += Util.hex16(addresses[i]+subline*4) + '\t';
                for (var sofs = 0; sofs < 4; sofs += 1) {
                    var adr = subline*4+sofs;
                    if (adr < lengths[i]) {
                        subresult += Util.hex8(this.mem[addresses[i]+adr]) + ' ';
                    }
                }
            }
            result.push(subresult + "<br/>");
        }
        result.push('</pre>');

        addr += lengths[i];
    }

    result.push(this.labelList());

    result.push("<div>&nbsp;</div>");

    if (this.doHexDump) {
        result.push(this.dump());
    }

    if (this.doIntelHex) {
        result.push("<div>&nbsp;</div>",
                this.intelHex(),
                "<div>&nbsp;</div>");
    }

    return result.join("");
};

Assembler.prototype.error = function(line, text) {
    this.errors[line] = text;
};

// assembler main entry point
Assembler.prototype.assemble = function(src) {
    var lengths = Array();
    var addresses = Array();

    var inputlines = src.split('\n');

    var addr = 0;
    this.clearLabels();
    this.resolveTable.length = 0;
    this.mem.length = 0;
    this.org = undefined;
    this.references.length = 0;
    this.textlabels.lenth = 0;
    this.errors.length = 0;
    this.doHexDump = true;
    this.postbuild = '';
    this.objCopy = 'gobjcopy';
    this.hexText = '';

    for (var line = 0, end = inputlines.length; line < end; line += 1) {
        var encodedLine = Util.toTargetEncoding(inputlines[line].trim(), this.targetEncoding);
        var size = this.parseInstruction(encodedLine, addr, line);
        if (size <= -100000) {
            addr = -size-100000;
            size = 0;
        } else if (size < 0) {
            this.error(line, "syntax error");
            size = -size;
        }
        lengths[line] = size;
        addresses[line] = addr;
        addr += size;
    }

    this.resolveLabelsTable();
    this.evaluateLabels();
    this.resolveLabelsInMem();

    /* If org was not defined explicitly, take first defined address */
    if (this.org === undefined) {
        var org;
        for (org = 0; org < this.mem.length && this.mem[org] === undefined; org++);
        this.org = org;
    }

    this.listingText = this.listing(inputlines, lengths, addresses);
};


// scapegoat functionis for V8 because try/catch
Assembler.prototype.evalPrepareExpr = function(input, addr) {
    try {
        input = input.replace(/\$([0-9a-fA-F]+)/, '0x$1');
        input = input.replace(/(^|[^'])\$|\./gi, ' '+addr+' ');
        input = input.replace(/([\d\w]+)\s(shr|shl|and|or|xor)\s([\d\w]+)/gi,'($1 $2 $3)');
        input = input.replace(/\b(shl|shr|xor|or|and|[+\-*\/()])\b/gi,
                function(m) {
                    switch (m) {
                        case 'and':
                            return '&';
                        case 'or':
                            return '|';
                        case 'xor':
                            return '^';
                        case 'shl':
                            return '<<';
                        case 'shr':
                            return '>>';
                        default:
                            return m;
                    }
                });
    } catch (e) {
        return null;
    }
    return input;
};

Assembler.prototype.evalInvoke = function(expr) {
    try {
        return eval(expr);
    } catch (err) {
        //console.log('expr was:',expr);
        //console.log(err);
    }

    return -1;
};

Assembler.prototype.evaluateExpression = function(input, addr0) {
    var originput = input;
    input = this.evalPrepareExpr(input, addr0);
    if (!input) {
        return -1;
    }
    var q = input.split(/<<|>>|[+\-*\/()\^\&\|]/);
    var expr = '';
    for (var ident = 0; ident < q.length; ident++) {
        var qident = q[ident].trim();
        if (-1 != this.resolveNumber(qident)) continue;
        var addr = this.labels[qident];//.indexOf(qident);
        if (addr !== undefined) {
            //addr = this.labels[idx+1];
            if (addr >= 0) {
                expr += 'var _' + qident + '=' + addr +';\n';
                var rx = new RegExp('\\b'+qident+'\\b', 'gm');
                input = input.replace(rx, '_' + qident);
            } else {
                expr = false;
                break;
            }
        }
    }
    //console.log('0 input=',  input);
    //console.log('1 expr=', expr);
    var that = this;
    expr += input.replace(/0x[0-9a-fA-F]+|[0-9][0-9a-fA-F]*[hbqdHBQD]|'.'/g,
            function(m) {
                return that.resolveNumber(m);
            });
    //console.log('expr=', expr);
    return this.evalInvoke(expr.toLowerCase());
};

Assembler.prototype.evaluateLabels = function() {
    for (var i in this.labels) {
        var label = this.labels[i];
        if (label < 0 && this.resolveTable[-label] === undefined) {
            var result = this.evaluateExpression(i,-1);
            if (result >= 0) {
                this.resolveTable[-label] = result;
                this.labels[i] = undefined;
            }
        } 
    }
};

Assembler.prototype.resolveLabelsInMem = function() {
    for (var i = 0, end_i = this.mem.length; i < end_i;) {
        var negativeId;
        if ((negativeId = this.mem[i]) < 0) {
            var newvalue = this.resolveTable[-negativeId];

            if (newvalue !== undefined) this.mem[i] = newvalue & 0xff;
            i++;
            if (this.mem[i] == negativeId) {
                if (newvalue !== undefined) this.mem[i] = 0xff & (newvalue >> 8);
                i++;
            }
        } else {
            i++;
        }
    }
};

Assembler.prototype.resolveLabelsTable = function(nid) {   
    for (var i in this.labels) {
        var label = this.labels[i];
        if (label < 0) {
            var addr = this.resolveTable[-label];
            if (addr !== undefined) {
                this.labels[i] = addr;
            }
        }
    }
};

var asm = new Assembler();
self.addEventListener('message', function(e) {
    var cmd = e.data['command'];
    if (cmd == 'assemble') {
        asm.assemble(e.data['src']);
        self.postMessage(
                {'listing':asm.listingText, 
                    'textlabels':asm.textlabels,
                    'references':asm.references,
                    'hex':asm.hexText,
                    'binFileName':asm.binFileName,
                    'hexFileName':asm.hexFileName,
                    'downloadFormat':asm.downloadFormat,
                    'tapeFormat':asm.tapeFormat,
                });
    } else if (cmd == 'getmem') {
        self.postMessage({'mem': JSON.parse(JSON.stringify(asm.mem)),
            'org': asm.org,
            'binFileName': asm.binFileName,
            'tapeFormat':asm.tapeFormat,
            'download':false});
    } else if (cmd == 'getbin') {
        self.postMessage({'mem': JSON.parse(JSON.stringify(asm.mem)),
            'org': asm.org,
            'binFileName': asm.binFileName,
            'tapeFormat':asm.tapeFormat,
            'download':'bin'
        });
    } else if (cmd == 'getwav') {
        self.postMessage({'mem': JSON.parse(JSON.stringify(asm.mem)),
            'org': asm.org,
            'binFileName': asm.binFileName,
            'tapeFormat':asm.tapeFormat,
            'download':e.data['mode']
        });
    }
}, false);
