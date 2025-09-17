"use strict";

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
    static DATA = 0x10;       // copy until ':'
    static QUOTE = 0x20;      // copy until '"'
    static VERBATIM = 0x40;   // copy until eol
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

    static function_tokens = ['TAB(', 'SPC(', 'FN', 'SGN', 'INT',
        'ABS', 'USR', 'FRE', 'INP', 'POS', 'SQR', 'RND', 'LOG', 'EXP', 'COS',
        'SIN', 'TAN', 'ATN', 'PEEK', 'LEN', 'STR$', 'VAL', 'ASC', 'CHR$',
        'LEFT$', 'RIGHT$', 'MID$', 'POINT', 'INKEY$', 'AT', '&',
        '@', 'ASN', 'ADDR', 'PI', 'ACS', 'LG', 'GET', 'PUT'];

    static Functions = {};

    static by_initial = {};

    static {
        for (const key of "ABCDEFGHIJKLMNOPQRSTUVWXYZ*/^>=<&@+-") {
            Tokens.by_initial[key] = [];
        }

        for (const w of Tokens.Words) {
            Tokens.by_initial[w[0]].push(w);
        }

        for (const w of Tokens.function_tokens) {
            Tokens.Functions[w] = true;
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
        if ((mode & (Mode.VERBATIM | Mode.QUOTE | Mode.DATA)) !== 0) {
            return;
        }

        const kws = Tokens.by_initial[initial];
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
    if (!s || s.length == 0 || !isNum(s[0])) return [-1, 0];
    for (c of s.split('')) {
        if (isNum(c)) {
            linenum = linenum * 10 + parseInt(c);
            ++text;
        } else {
            if (c === ' ') {
                ++text;
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

function tokenize2(s, addr, frags) {
    let tokens = [];
    let words = [];
    let complete = [];
    let last_token = "";
    let [linenum, i] = getLinenumber(s);
    if (linenum < 0 || i == 0) return [[], addr, []]; // ignore empty lines, lines without numbers
   
    frags && frags.push({ type: "text", value: s.slice(0, i)});

    let seqStart = i;
    pickKeywords(s[i], i, Mode.INITIAL, words, complete);
    let mode = Mode.TOKENIZE;
    while (i < s.length) {
        trackWords(s[i], words, complete);
        const breakchar = s[i];
        if (breakchar === Tokens.QUOTE) {
            mode ^= Mode.QUOTE;
        }
        if (breakchar === ':' && (mode & Mode.DATA)) {
            mode ^= Mode.DATA;
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
                frags && frags.push({type: "text", value: s.slice(seqStart, complete[0][2])});

                for (let j = 0; j < complete.length; j++) {
                    const b = complete[j];
                    if (j > 0 && b[2] !== i) { // tokens overlap, only keep 1st
                        break;
                    }
                    tokens.push(Tokens.Words.indexOf(b[0]) + 0x80);
                    if (frags) {
                        const type = Tokens.Functions[b[0]] ? "support.function" : "keyword";
                        frags.push({type: type, value: b[0]});
                    }
                    i = b[2] + b[0].length;
                    seqStart = i;
                    //if (b[0] === 'DATA' || b[0] === 'REM') {
                    if (b[0] === 'REM') {
                        last_token = b[0];
                        mode = Mode.VERBATIM;
                        break; // mode switch, cancel following tokens
                    }
                    if (b[0] === 'DATA') {
                        mode |= Mode.DATA;
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
    if (frags) {
        let type = "text";
        switch (last_token) {
            case 'DATA':
                type = "data";
                break;
            case 'REM':
                type = "comment";
                break;
        }
        frags.push({type: type, value: s.slice(seqStart)});
    }
    const recsize = tokens.length + 4;
    addr += recsize;
    tokens.unshift(addr & 255, addr >> 8, linenum & 255, (linenum >> 8) & 255);
    return [tokens, addr];
}

globalThis.asc2bas_tokenize2 = tokenize2;
