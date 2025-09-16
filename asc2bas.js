/*jshint sub:true*/ 		// object['prop'] is ok 
/*jshint evil: true */ 		// eval is okay
/*globals self: false */ 	// self is defined by worker scope

"use strict";

importScripts('util.js');
importScripts('tape.js');
importScripts('cpp.js/cpp.js');

const ENCODING = 'utf-8'; // None, try 'utf-8' or 'cp1251'
const ENCODINGS = ['utf-8', 'cp1251'];

class State {
    static DUMMY0 = 0;
    static DUMMY1 = 1;
    static LINENUM0 = 2;
    static LINENUM1 = 3;
    static TOKENS = 4;
    static END = 5;
}

class Mode {
    static INITIAL = 0x00;
    static TOKENIZE = 0x01;
    static QUOTE = 0x20;
    static VERBATIM = 0x40;
}

class Tokens {
    static QUOTE = '"';
    static Chars = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABC' +
        'DEFGHIJKLMNOPQRSTUVWXYZ[\\]^_ЮАБЦДЕФГ' +
        'ХИЙКЛМНОПЯРСТУЖВЬЫЗШЭЩЧ' + String.fromCharCode(127);
    static Words = ['CLS', 'FOR', 'NEXT', 'DATA', 'INPUT', 'DIM', 'READ', 'CUR', 'GOTO',
        'RUN', 'IF', 'RESTORE', 'GOSUB', 'RETURN', 'REM', 'STOP', 'OUT', 'ON',
        'PLOT', 'LINE', 'POKE', 'PRINT', 'DEF', 'CONT', 'LIST', 'CLEAR',
        'CLOAD', 'CSAVE', 'NEW', 'TAB(', 'TO', 'SPC(', 'FN', 'THEN', 'NOT',
        'STEP', '+', '-', '*', '/', '^', 'AND', 'OR', '>', '=', '<', 'SGN', 'INT',
        'ABS', 'USR', 'FRE', 'INP', 'POS', 'SQR', 'RND', 'LOG', 'EXP', 'COS',
        'SIN', 'TAN', 'ATN', 'PEEK', 'LEN', 'STR$', 'VAL', 'ASC', 'CHR$',
        'LEFT$', 'RIGHT$', 'MID$', 'POINT', 'INKEY$', 'AT', '&', 'BEEP',
        'PAUSE', 'VERIFY', 'HOME', 'EDIT', 'DELETE', 'MERGE', 'AUTO', 'HIMEM',
        '@', 'ASN', 'ADDR', 'PI', 'RENUM', 'ACS', 'LG', 'LPRINT', 'LLIST',
        'SCREEN', 'COLOR', 'GET', 'PUT', 'BSAVE', 'BLOAD', 'PLAY', 'PAINT',
        'CIRCLE'];

    static by_initial = {};

    static {
        for (const key of "ABCDEFGHIJKLMNOPQRSTUVWXYZ*/^>=<&@+-") {
            Tokens.by_initial[key] = [];
        }

        for (const w of Tokens.Words) {
            Tokens.by_initial[w[0]].push(w);
        }
    }

    static gettext(c) {
        if (c < 0x20) {
            return c;
        } else if (c < 0x80) {
            return Tokens.Chars.charCodeAt(c - 0x20);
        } else {
            return Tokens.Words[c - 0x80];
        }
    }

    static chars(text) {
        const result = [];
        for (const c of text) {
            const index = Tokens.Chars.indexOf(c);
            if (index !== -1) {
                result.push(0x20 + index);
            } else {
                result.push(c.charCodeAt(0));
            }
        }
        return result;
    }
}

function format_token(t) {
    if (typeof t === 'number') {
        return String.fromCharCode(t);
    }
    if (typeof t === 'string') {
        return t;
    }
}

function process_line(line) {
    return String(line[0]) + ' ' + line.slice(1).map(format_token).join('');
}

function debas(mv) {
    const result = [];

    let state = State.DUMMY0;
    let fin = 0;
    let line = [];

    for (let i = 0; i < mv.length; i++) {
        const c = mv[i];
        if (state === State.DUMMY0) {
            if (c === 0) {
                fin += 1;
            }
            state = State.DUMMY1;
        } else if (state === State.DUMMY1) {
            if (c === 0) {
                fin += 1;
            }
            if (fin === 3) {
                state = State.END;
            } else {
                state = State.LINENUM0;
            }
            line = [];
        } else if (state === State.LINENUM0) {
            line.push(c);
            state = State.LINENUM1;
        } else if (state === State.LINENUM1) {
            line[0] += c * 256;
            state = State.TOKENS;
        } else if (state === State.TOKENS) {
            if (c === 0) {
                fin = 1;
                state = State.DUMMY0;
                result.push(process_line(line));
            } else if (c > 0 && c <= 31) {
                line.push(c);
            } else if (c <= 228) {
                line.push(Tokens.gettext(c));
            } else {
                line.push(c);
            }
        } else if (state === State.END) {
            break;
        }
    }
    return result;
}

function isNum(c) {
    return c >= '0' && c <= '9';
}

// For given initial letter in position i, return list of keywords 
// that start with this letter.
// Each entry is ["keyword", count=0, position=i]
// If the mode is INITIAL, clear list of words and complete words
// If the mode is VERBATIM or QUOTE, return nothing
function pickKeywords(initial, i, mode, words, complete) {
    try {
        if ((mode & (Mode.VERBATIM | Mode.QUOTE)) !== 0) {
            return;
        }

        const kws = Tokens.by_initial[initial].slice();
        kws.forEach(w => {
            if (w.length === 1) {
                complete.push([w, 0, i]);
            } else {
                words.push([w, 0, i]);
            }
        });
    } catch (error) {
        if (mode === Mode.INITIAL) {
            words.length = 0;
            complete.length = 0;
        }
    }
}

// Parse number at the beginning of line and skip initial spaces
function getLinenumber(s) {
    let linenum = 0;
    let text = 0;
    let c = 0;
    for ([text, c] of s.split('').entries()) {
        if (isNum(c)) {
            linenum = linenum * 10 + parseInt(c);
        } else {
            if (c === ' ') {
                continue;
            } else {
                break;
            }
        }
    }
    return [linenum, text];
}

// Update word match count, move complete words to complete, delete mismatches
// See pick_keywords
function trackWords(c, words, complete) {
    let todelete = [];
    for (let j = 0; j < words.length; j++) {   // track keywords
        let wc = words[j];
        let k = wc[1] + 1;
        if (wc[0][k] === c) {
            wc[1] = k;
            if (wc[0].length - 1 === k) {
                complete.push(wc);
                todelete.push(j);
            }
        } else {
            todelete.push(j);  // char mismatch, this word is out
        }
    }

    for (let j = todelete.length - 1; j >= 0; j--) {
        words.splice(todelete[j], 1);            // purge untracked words
    }
}

// input: sorted by start position [[tok, x, pos]]
// output: only one token per pos, the longest
function suppressNonmax(complete) {
    let pos = -1;
    let result = [];
    for (let t of complete) {
        if (t[2] === pos) {
            if (t[0].length > result[result.length - 1][0].length) {
                result[result.length - 1] = t;
            }
        } else {
            result.push(t);
            pos = t[2];
        }
    }
    return result;
}

// for overlapping tokens, pick the longest even if it starts later
// IFK=ATHEN3 
//     AT
//      THEN <-- winrar
function suppressOverlaps(complete) {
    let currentEnd = -1;
    let currentLen = -1;
    const result = [];
    for (const t of complete) {
        if (t[2] < currentEnd) {
            if (t[0].length > currentLen) {
                result[result.length - 1] = t;
                currentLen = t[0].length;
                currentEnd = t[2] + currentLen;
            }
        } else {
            result.push(t);
            currentLen = t[0].length;
            currentEnd = t[2] + currentLen;
        }
    }
    return result;
}

function tokenize2(s, addr) {
    let tokens = [];
    let words = [];
    let complete = [];
    let [linenum, i] = getLinenumber(s);
    let seqStart = i;
    pickKeywords(s[i], i, Mode.INITIAL, words, complete);
    let mode = Mode.TOKENIZE;
    while (i < s.length) {
        trackWords(s[i], words, complete);
        const breakchar = s[i];
        if (breakchar === Tokens.QUOTE) {
            mode ^= Mode.QUOTE;
        }

        // add keywords that start at the current position to tracking
        pickKeywords(s[i], i, mode, words, complete);

        // all tracked words ended, or end of line
        if (words.length === 0 || i + 1 === s.length) {
            words = [];
            if (complete.length > 0) {
                // make sure that the tokens are in order of occurrence
                complete.sort((x, y) => x[2] - y[2]);
                complete = suppressNonmax(complete);   // INPUT vs INP..
                complete = suppressOverlaps(complete); // THEN over AT in ATHEN 
                // flush dangling character tokens 
                tokens.push(...Tokens.chars(s.slice(seqStart, complete[0][2])));
                for (let j = 0; j < complete.length; j++) {
                    const b = complete[j];
                    if (j > 0 && b[2] !== i) { // tokens overlap, only keep 1st
                        break;
                    }
                    tokens.push(Tokens.Words.indexOf(b[0]) + 0x80);
                    i = b[2] + b[0].length;
                    seqStart = i;
                    if (b[0] === 'DATA' || b[0] === 'REM') {
                        mode = Mode.VERBATIM;
                        break; // mode switch, cancel following tokens
                    }
                }
                if (breakchar !== Tokens.QUOTE) {
                    i = i - 1;
                }
                complete.length = 0;
            } else {
                // do nothing
            }
        }

        i++;
    }

    tokens.push(...Tokens.chars(s.slice(seqStart)), 0);
    const recsize = tokens.length + 4;
    addr += recsize;
    tokens.unshift(addr & 255, addr >> 8, linenum & 255, (linenum >> 8) & 255);
    return [tokens, addr];
}

function _enbas(inputlines) {
    let result = [];
    let addr = 0x4301;

    for (let enc of ENCODINGS) {
        try {
            console.log(`Trying encoding ${enc}...`);
            for (let line = 0; line < inputlines.length; ++line) {
                let text = inputlines[line].text;
                console.log("Input=[" + text + "]");
                let tokens;
                [tokens, addr] = tokenize2(text.trim(), addr);
                result = result.concat(tokens);
            }
            break;
        } catch (error) {
            console.log('Failed...');
        }
    }

    result.push(0);
    result.push(0);

    // add padding for perfect file match
    const padding = new Array(256 - (result.length % 256)).fill(0);
    return new Uint8Array(result.concat(padding));
}

class Bas {
    constructor()
    {
        this.tokens = [];
        this.gutterContent = [{}, {}];
        this.errors = [];
        this.org = 0x4300;
        this.xref = [];
        this.tossed_xrefs = {'':{}};
        this.labels = [];
    }

    enbas(fulltext)
    {
        this.gutterContent = [{}, {}];
        this.errors = [];
        this.org = 0x4300;
        this.xref = [];
        this.tossed_xrefs = {'':{}};
        this.labels = [];
        this.tokens = _enbas(fulltext);

        if (fulltext && fulltext.length > 0) {
            this.binFileName = fulltext[0].file;
        }
        else {
            this.binFileName = "unnamed.bas";
        }
    }

    getBinFileName()
    {
        return this.binFileName;
    }

    getTapFileName()
    {
        return Util.replaceExt(this.binFileName, ".cas");
    }
};

let bas = new Bas();
let cpp;
let cpp_oneline;  // created by cpp.run()
let cpp_finish;   // created by cpp.run()

function preprocessFile(project, file, nest)
{
    let result = [];
    const text = project.files[file];

    let input = text.split('\n');
    for (let i = 0; i < input.length; ++i) {
        const line = input[i].trimStart();
        if (line.startsWith(".include")) {
            const parts = line.split(/\s+/);
            let include = parts.length > 1 ? parts[1].replace(/^\"+|\"+$/g, '') : undefined;
            
            if (project.files[include]) {
                let included = preprocessFile(project, include, nest + 1);
                result.push(...included);
            }
            else {
                result.push(
                    {nest: nest + 1,
                        text: ";* ERROR: include file \"" + include + "\" not found",
                        file: file,
                        line_num: i});
            }
        }
        else {
            let processed = line;
            try {
                if (cpp_oneline) processed = cpp_oneline(line);
            } 
            catch (e) {
                console.log(e);
                cpp_oneline = null;
            }
            result.push({nest: nest, text: processed, file: file, line_num: i});
        }
    }

    return result;
}

function tokenizeProject(project)
{
    let main = Object.keys(project.files)[0];

    const cpp_js_settings = {
        signal_char : '#',
        warn_func : (s, line) => {
            console.log("cpp warning: ", s); 
            bas.cpp_errors[line] = s;
        },
        error_func : (s, line) => { 
            console.log("cpp error: ", s);
            bas.cpp_errors[line] = s;
        },
        include_func : null,
        comment_stripper : (s) => { return s; }
    };
    cpp = new cpp_js(cpp_js_settings);
    [cpp_oneline, cpp_finish] = cpp.run(""); // only creates the functors
    bas.cpp_errors = {};
    let preprocessed = preprocessFile(project, main, 0);
    try {
        cpp_finish();
    }
    catch (e) {
        console.log(e);
    }
    for (let i in bas.cpp_errors) {
        console.log(i, "cpp_error in line ", i, ": ", bas.cpp_errors[i]);
        if (i >= preprocessed.length) {
            bas.cpp_errors[preprocessed.length - 1] += bas.cpp_errors[i];
        }
    }
    bas.enbas(preprocessed);
}

self.addEventListener('message', function(e) {
    var cmd = e.data['command'];
    if (cmd === 'assemble') {
        tokenizeProject(e.data['project']);
        self.postMessage(
            {
                'gutter':bas.gutterContent[0],
                'by_file':bas.gutterContent[1],
                'errors':bas.errors,
                'tapeFormat':'v06c-cload',
                'org':bas.org,
                'xref':bas.xref, 
                'xref_by_file':bas.tossed_xrefs,
                'labels':bas.labels,
                'kind':'assemble',
            });
    }
    else if (cmd === 'getmem') {
        console.log('getmem'); // is it used?
    }
    else if (cmd.startsWith('getbin')) {
        let parts = cmd.split(',');
        let extra;
        if (parts.length > 1) {
            extra = parts[1];
        }
        let jsarray = [...bas.tokens];
        self.postMessage({'mem': JSON.parse(JSON.stringify(jsarray)),
            'org': 0,//bas.org,
            'filename': bas.getBinFileName(),
            'tapeFormat': 'v06c-cload',
            'download': 'bin',
            'extra': extra
        });
    }
    else if (cmd.startsWith('gethex')) {
        console.log('getbin');
    }
    else if (cmd.startsWith('gettap')) {
        console.log('gettap');
        let parts = cmd.split(',');
        let extra;
        if (parts.length > 1) {
            extra = parts[1];
        }
        let jsarray = [...bas.tokens];
        self.postMessage({'mem': JSON.parse(JSON.stringify(jsarray)),
            'org': 0,
            'filename': bas.getTapFileName(),
            'tapeFormat': 'v06c-cload',
            'download':'tap',
            'extra': extra
        });
    }
    else if (cmd.startsWith('getwav')) {
        console.log('getwav');
    }
});
