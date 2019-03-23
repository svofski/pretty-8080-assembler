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
// -- all of the above is kept for historical reasons only --

importScripts('encodings.js');
importScripts('util.js');
importScripts('tape.js');

function Assembler() {
    this.debug = false;
    this.tapeFormat = 'rk-bin';
    this.doHexDump = false;
    this.doIntelHex = false;
    this.targetEncoding = 'koi8-r';
    this.project = "test";


    this.labels = {};
    this.xref = {};
    this.mem = [];
    this.org = undefined;
    this.textlabels= [];
    this.references = [];
    this.errors = [];
    this.gutterContent = [];
}

Assembler.prototype.getBinFileName = function()
{
    if (this.project.indexOf('.') === -1) {
        return this.project + '.bin';
    }
    else {
        return this.project;
    }
}

Assembler.prototype.getHexFileName = function()
{
    if (this.project.indexOf('.') === -1) {
        return this.project + '.hex';
    }
    else {
        return Util.replaceExt(this.project, '.hex');
    }
}

Assembler.prototype.getTapFileName = function()
{
    if (this.project.indexOf('.') === -1) {
        return this.project + '.cas';
    }
    else {
        return Util.replaceExt(this.project, '.cas');
    }
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

/* try to resolve a number literal, return value or undefined */
Assembler.prototype.resolveNumber = function(identifier) {
    if (identifier === undefined || identifier.length === 0) return undefined;

    var first = identifier[0];
    if ((first === "'" || first === '"') && identifier.length === 3) {
        return 0xff & identifier.charCodeAt(1);
    }

    //if (first === '$') {
    if (identifier.match(/^\$[0-9a-f]+$/)) {
        let test = Number("0x" + identifier.substr(1, identifier.length-1));
        return test;
    }

    //if (Assembler.DecimalDigits.indexOf(identifier[0]) != -1) {
    if (identifier.match(/^[+-]?[0-9]+/)) {
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
                    if (oct[i] == '8' || oct[i] == '9') return undefined;
                }
                var octaltest = parseInt(oct, 8);
                if (!isNaN(octaltest)) {
                    return octaltest;
                }
                break;
        }
    }
    return undefined;
};

Assembler.prototype.referencesLabel = function(identifier, linenumber) {
    if (this.references[linenumber] === undefined) {
        this.references[linenumber] = identifier.toLowerCase();
    }
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

Assembler.parseRegisterPair = function(s, forstack) {
    if (s !== undefined) {
        s = s.trim().split(';')[0].toLowerCase();
        if (s == 'b' || s == 'bc') return 0;
        if (s == 'd' || s == 'de') return 1;
        if (s == 'h' || s == 'hl') return 2;
        if (forstack) { // push/pop
            if (s == 'psw' || s == 'a') return 3;
        } 
        else {  // lxi, dad
            if (s == 'sp') return 3;
        }
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
    this.useExpression([s], addr, length, linenumber);
    this.referencesLabel(s, linenumber);

    return length;
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
    for (i = 0, end_i = text.length; i < end_i && mode !== 10; i+=1) {
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
                    // parse what's left, don't include the ';' symbol itself
                    i -= 1;
                    mode = 10;
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
};

Assembler.prototype.useExpression = function(s, addr, length, linenumber)
{
    var result = new Expression(addr, length, s, linenumber);
    this.expressions.push(result);
    return result;
};

Assembler.prototype.labelResolution = function(label, value, addr, lineno, 
    rewrite)
{
    if (this.label_resolutions[label] && !rewrite) {
        return undefined;
    }
    var numberwang = this.resolveNumber(value);
    var lr = {};
    if (numberwang !== undefined) {
        lr = {number: numberwang, linenumber: lineno};
    }
    else {
        lr = {expression: value, addr: addr, linenumber: lineno};
    }
    this.label_resolutions[label] = lr;
    return lr;
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

Assembler.prototype.splitParts = function(s)
{
    var lines = [];
    var parts = [];
    var state = 0;
    var cork = undefined;
    var remainder = s.trimStart();
    for(;state !== 100;) {
        switch (state) {
            case 0:
                switch (remainder.charAt(0)) {
                    case ';': 
                        parts.push(remainder);
                        state = 100;
                        break;
                    case '"':
                        cork = '"';
                        state = 10;
                        break;
                    case "'":
                        cork = "'";
                        state = 10;
                        break;
                    case '\\':
                        lines.push(parts);
                        parts = [];
                        remainder = remainder.slice(1).trimStart();
                        break;
                    default:
                        var at = remainder.search(/[\s\\;"']/);
                        if (at >= 0) {
                            parts.push(remainder.slice(0, at));
                            remainder = remainder.slice(at).trimStart();
                        } 
                        else {
                            parts.push(remainder);
                            state = 100;
                        }
                        break;
                }
                break;
            case 10:
                var n = remainder.slice(1).search(cork);
                if (n > 0) {
                    n += 2;
                    parts.push(remainder.slice(0, n));
                    remainder = remainder.slice(n).trimStart();
                    state = 0;
                }
                else {
                    parts.push(remainder);
                    remainder = '';
                    state = 100;
                }
                break;
            case 100:
                break;
        }
        if (remainder.length == 0) {
            break;
        }
    }
    lines.push(parts);
    return lines;
};

Assembler.prototype.parseInstruction = function(parts, addr, linenumber) {
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
    var label_obj;

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

            this.useExpression(parts.slice(1), addr+1, 2, linenumber);

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
            let rp = Assembler.parseRegisterPair(subparts[0], false);
            if (rp == -1) return -3;

            this.mem[addr] = opcs | (rp << 4);

            this.useExpression(subparts.slice(1), addr+1, 2, linenumber);
            result = 3;
            break;
        }

        // immediate byte		
        if ((opcs = Assembler.opsIm8[mnemonic]) !== undefined) {
            this.mem[addr] = opcs;
            this.useExpression(parts.slice(1), addr+1, 1, linenumber);
            result = 2;
            break;
        }

        // single register, im8
        if ((opcs = Assembler.opsRegIm8[mnemonic]) !== undefined) {
            let args = parts.slice(1).join(""); // #14 test: mvi a, ','
            let comma = args.indexOf(",");
            if (comma < 1) {
                result = -2;
                break;
            }
            let subparts = [args.substring(0, comma), args.substring(comma+1)];
            var reg = Assembler.parseRegister(subparts[0]);
            if (reg == -1) {
                result = -2;
                break;
            }

            this.mem[addr] = opcs | reg << 3;

            this.useExpression(subparts.slice(1), addr+1, 1, linenumber);
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
            let stack = ["push","pop"].indexOf(mnemonic) != -1;
            let rp = Assembler.parseRegisterPair(parts[1], stack);
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
            this.processLabelResolutions();
            let n = this.evaluateExpression2(parts.slice(1).join(' '), addr, 
                linenumber);
            if (n >= 0 && n < 65536) {
                if (this.org === undefined || n < this.org) {
                    this.org = n;
                }
                result = -100000-n;
            } else {
                result = -1;
            }
            break;
        }

        if (mnemonic == ".project") {
            if (parts[1] !== undefined && parts[1].trim().length > 0) {
                this.project = parts[1];
            }
            result = -100000;
            break;
        }

        if (mnemonic == ".tape") {
            if (parts[1] !== undefined && parts[1].trim().length > 0) {
                this.tapeFormat = parts[1];
                var test = new TapeFormat(this.tapeFormat);
                if (test.format) {
                    result = -100000;
                    break;
                }
            }
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
            if (labelTag === undefined) {
                return -1;
            }
            var ex = new Expression(-1, 2, parts.slice(1), linenumber);
            this.labelResolution(labelTag, ex.text, addr, linenumber, true);
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
            let size = this.evaluateExpression2(parts.slice(1).join(' '), addr, 
                linenumber);
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
            label_obj = this.labelResolution(labelTag, String(addr), addr,
                linenumber);
            if (label_obj === undefined) {
                result = -1;
                break;
            }
            parts.splice(0, 1, splat.slice(1).join(':'));
            continue;
        }

        this.mem[addr] = -2;
        result = -1; // error
        break;
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

    var result = "Labels:\n";
    var col = 1;
    for (var j = 0; j < sorted.length; j++) {
        let i = sorted[j];
        var label = this.labels[i];

        // hmm? 
        if (label === undefined) continue;
        if (i.length === 0) continue; // resolved expressions
        var resultClass = (col%4 === 0 ? 't2' : 't1');

        result += f(i,label);
        if ((col + 1) % 2 === 0) {
            result += "\n";
        } 
        else {
            result += "\t";
        }
        col++;
    }

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
            } else{
                result += conv(this.mem[i]);
            }
        }
    }

    return nonempty ? result : false;
};

Assembler.prototype.dump = function() {
    var org = 0;

    if (org % 16 !== 0) org = org - org % 16;

    var result = "Memory dump:\n";
    var lastempty;

    var printline = 0;

    for (var i = org, end_i = this.mem.length; i < end_i; i += 16) {
        var span = this.dumpspan(i, 0);
        //if (span || !lastempty) {
        //    result += '<pre ' + 'class="d' + (printline++%2) + '"';
        //    result += ">";
        //}
        if (span) {
            result += Util.hex16(i) + ": ";
            result += span;
            result += '  ';
            result += this.dumpspan(i, 1);
            result += '\n';
            lastempty = false;
        } 
        if (!span && !lastempty) {
            result += ' \n';//" </pre><br/>";
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
            var bb = this.mem[i+j];
            if (bb < 0) bb = 0;
            rec += Util.hex8(bb); 
            cs += bb;
        }

        cs += j; line += Util.hex8(j);   // byte count
        cs += (i>>8)&255; cs+=i&255; line += Util.hex16(i);  // record address
        cs += 0; line += "00";      // record type 0, data
        line += rec;

        cs = 0xff&(-(cs&255));
        line += Util.hex8(cs);
        pureHex += line + '\n';
        r += line + '<br/>';

        i += j;
    }
    r += ':00000001FF<br/>';
    pureHex += ':00000001FF\n';
    //r += '.<br>w ' + this.hexFileName +'<br>q<br>';
    r += 'X<br/>';
    r += this.objCopy + ' -I ihex ' + this.hexFileName + ' -O binary ' + 
        this.getBinFileName() + '<br/>';
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


Assembler.prototype.gutter = function(text,lengths,addresses) {
    var result = [];
    var addr = 0;

    for(var i = 0, end_i = text.length; i < end_i; i += 1) {
        var unresolved = false;
        var width = 0;
        var hexes = new Int32Array(lengths[i]);
        for (let b = 0; b < lengths[i]; ++b) {
            var bytte = this.mem[addresses[i]+b];
            if (bytte === undefined || bytte < 0) {
                unresolved = true;
                hexes[b] = -1;
            } 
            else {
                hexes[b] = bytte;
            }
        }

        var err = this.errors[i] || unresolved !== false;

        var gutobj = {
            addr : addresses[i],
            hex : hexes,
            error: err
        };

        result.push(gutobj);
    }

    return result;
}

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

        result.push((lengths[i] > 0 ? Util.hex16(addresses[i]) : "") + "\t" + hexes);

        if (labeltext.length > 0) {
            result.push(labeltext);
        }
        var padding = '';
        for (var b = 0; b < remainder.length && Util.isWhitespace(remainder[b]); b++) {
            padding += remainder[b]; // copy to preserve tabs
        }
        result.push(padding);
        remainder = remainder.substring(b);
        if (remainder.length > 0) {
            result.push(remainder);
        }

        if (comment.length > 0) {
            result.push(comment);
        }

        // display only first and last lines of db thingies
        if (len < lengths[i]) {
            result.push('\n\t. . .\n');
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
            result.push(subresult + '\n');
        }
        result.push('\n');

        addr += lengths[i];
    }

    result.push(this.labelList());

    result.push('\n');

    if (this.doHexDump) {
        result.push(this.dump());
    }

    if (this.doIntelHex) {
        result.push(this.intelHex());
    }

    return result.join("");
};

Assembler.prototype.error = function(line, text) {
    this.errors[line] = text;
};

function Expression(addr, length, s, linenumber)
{
    this.addr = addr;
    this.length = length;
    this.linenumber = linenumber;
    this.update(s);
}

Expression.prototype.update = function(arr) 
{
    var ex = arr.join(' ').trim();
    if (ex[0] == '"' || ex[0] == "'") {
        this.text = ex;
    }
    else {
        this.text = ex.split(';')[0];
    }
}

// assembler main entry point
Assembler.prototype.assemble = function(src,listobj) {
    var lengths = Array();
    var addresses = Array();

    var inputlines = src.split('\n');

    var addr = 0;
    this.labels = [];
    this.mem.length = 0;
    this.org = undefined;
    this.errors.length = 0;
    this.postbuild = '';
    this.objCopy = 'gobjcopy';
    this.hexText = '';
    this.xref = {};

    this.expressions = [];          // expressions to evaluate after label resolution
    this.label_resolutions = {};    // labels, resolved and not

    for (var line = 0, end = inputlines.length; line < end; line += 1) {
        var encodedLine = Util.toTargetEncoding(inputlines[line].trim(), this.targetEncoding);
        var sublines = this.splitParts(encodedLine);

        for (var sul = 0; sul < sublines.length; ++sul) {
            var size = this.parseInstruction(sublines[sul], addr, line);
            if (size <= -100000) {
                addr = -size-100000;
                size = 0;
            } else if (size < 0) {
                this.error(line, "syntax error");
                size = 0; //-size;
                break;
            }
            var l = lengths[line];
            if (l === undefined) {
                lengths[line] = size;
            }
            else {
                lengths[line] = lengths[line] + size;
            }
            if (sul === 0) addresses[line] = addr;
            addr += size;
        }
    }

    this.resolveExpressions();

    /* If org was not defined explicitly, take first defined address */
    if (this.org === undefined) {
        var org;
        for (org = 0; org < this.mem.length && this.mem[org] === undefined; org++);
        this.org = org;
    }

    this.gutterContent = this.gutter(inputlines, lengths, addresses);
    if (listobj) {
        listobj.text = this.listing(inputlines, lengths, addresses);
    }
};

Assembler.prototype.addxref = function(ident, linenumber)
{
    ident = ident.toLowerCase();
    if (this.xref[ident] === undefined) {
        this.xref[ident] = [];
    }
    this.xref[ident].push(linenumber);
}

Assembler.prototype.evaluateExpression2 = function(input, addr0, linenumber) {
    var originput = input;
    input = this.evalPrepareExpr(input, addr0);
    if (!input) {
        return -1;
    }
    try {
    var q = input.split(/<<|>>|[+\-*\/()\^\&\|]/);
    var expr = '';
    for (var ident = 0; ident < q.length; ident++) {
        var qident = q[ident].trim();
        if (this.resolveNumber(qident) !== undefined) continue;
        var addr = this.labels[qident.toLowerCase()];
        if (addr !== undefined) {
            expr += 'var _' + qident + '=' + addr +';\n';
            var rx = new RegExp('\\b'+qident+'\\b', 'gm');
            input = input.replace(rx, '_' + qident);
            this.addxref(qident, linenumber);
        }
    }
    //console.log('0 input=',  input);
    //console.log('1 expr=', expr);
    var that = this;
    expr += input.replace(/\b0x[0-9a-fA-F]+\b|\b[0-9][0-9a-fA-F]*[hbqdHBQD]?\b|'.'/g,
            function(m) {
                return that.resolveNumber(m);
            });
    //console.log('expr=', expr);
    return this.evalInvoke(expr.toLowerCase());
    }
    catch(err) {
        this.errors[linenumber] = err.toString();
        return -1;
    }
};


Assembler.prototype.processLabelResolutions_once = function()
{
    var lr2 = {};
    var unresolved_count = 0;
    for (var label in this.label_resolutions) {
        var lr = this.label_resolutions[label];
        if (lr.expression) {
            var ev = this.evaluateExpression2(lr.expression, lr.addr, 
                lr.linenumber);
            if (ev === undefined) {
                lr2[label] = lr;
                ++unresolved_count;
            }
            else {
                this.labels[label] = ev;
                this.addxref(label, lr.linenumber);
            }
        }
        else {
            this.labels[label] = lr.number;
            this.addxref(label, lr.linenumber);
        }
    }
    //console.log('resolveExpressions: labels=', this.labels, ' lr2=', lr2);
    this.label_resolutions = lr2;
    return unresolved_count;
};

Assembler.prototype.processLabelResolutions = function()
{
    var max_iteration = Object.keys(this.label_resolutions).length;
    var unresolved_count = max_iteration;
    for (var i = 0; i < max_iteration && unresolved_count > 0; ++i) {
        unresolved_count = this.processLabelResolutions_once();
    }
};


Assembler.prototype.resolveExpressions = function()
{
    this.processLabelResolutions();
    for (var i = 0; i < this.expressions.length; ++i) {
        var eobj = this.expressions[i];
        var ev = this.evaluateExpression2(eobj.text, eobj.addr-1,
            eobj.linenumber);
        if (ev !== undefined) {
            if (eobj.length === 1) {
                if (ev >= -128 && ev < 256) {
                    this.setmem8(eobj.addr, ev & 0xff);
                }
            } 
            else if (eobj.length === 2) {
                if (ev >= -32768 && ev < 65536) {
                    this.setmem16(eobj.addr, ev & 0xffff);
                }
            }
        }
    }
};


// scapegoat functionis for V8 because try/catch
Assembler.prototype.evalPrepareExpr = function(input, addr) {
    try {
        input = input.replace(/\$([0-9a-fA-F]+)/, '0x$1');
        input = input.replace(/(?:^|[^'])([\$\.])/, ' '+addr+' ');
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

    return undefined;
};

var asm = new Assembler();
self.addEventListener('message', function(e) {
    var cmd = e.data['command'];
    if (cmd == 'assemble') {
        asm.assemble(e.data['src']);
        self.postMessage(
                {//'listing':asm.listingText, 
                    'gutter':asm.gutterContent,
                    'errors':asm.errors,
                    //'textlabels':asm.textlabels,
                    //'references':asm.references,
                    'org':asm.org,
                    'xref':asm.xref,
                    'labels':asm.labels,
                    'kind':'assemble',
                });
    } 
    else if (cmd == 'getmem') {
        self.postMessage({'mem': JSON.parse(JSON.stringify(asm.mem)),
            'org': asm.org,
            'binFileName': asm.getBinFileName(),
            'tapeFormat':asm.tapeFormat,
            'download':false});
    } 
    else if (cmd == 'getbin') {
        self.postMessage({'mem': JSON.parse(JSON.stringify(asm.mem)),
            'org': asm.org,
            'filename': asm.getBinFileName(),
            'download':'bin'
        });
    } 
    else if (cmd == 'gethex') {
        asm.intelHex(); // make sure that hexText is up to date
        self.postMessage({'mem': JSON.parse(JSON.stringify(asm.mem)),
            'org': asm.org,
            'filename': asm.getHexFileName(),
            'hex':asm.hexText,
            'download':'hex'
        });
    } 
    else if (cmd == 'gettap') {
        self.postMessage({'mem': JSON.parse(JSON.stringify(asm.mem)),
            'org': asm.org,
            'filename': asm.getTapFileName(),
            'tapeFormat':asm.tapeFormat,
            'download':'tap'
        });
    } 
    else if (cmd == 'getwav') {
        self.postMessage({'mem': JSON.parse(JSON.stringify(asm.mem)),
            'org': asm.org,
            'binFileName': asm.getBinFileName(),
            'tapeFormat':asm.tapeFormat,
            'download':e.data['mode']
        });
    }
}, false);
