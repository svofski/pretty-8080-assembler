/*jshint sub:true*/ 		// object['prop'] is ok 
/*jshint evil: true */ 		// eval is okay
/*globals self: false */ 	// self is defined by worker scope

"use strict";

importScripts('util.js');
importScripts('tape.js');
importScripts('cpp.js/cpp.js');
importScripts('asc2bas.js');

class Bas {
    constructor()
    {
        this.tokens = [];
        this.errors = [];
        this.org = 0x4300;
        this.xref = [];
        this.tossed_xrefs = {'':{}};
        this.labels = [];
        this.gutter_by_file = {};
    }

    enbas(fulltext)
    {
        this.gutter_by_file = {};
        this.errors = [];
        this.org = 0x4300;
        this.xref = [];
        this.tossed_xrefs = {'':{}};
        this.labels = [];

        this.tokens = this._enbas(fulltext);

        if (fulltext && fulltext.length > 0) {
            this.binFileName = fulltext[0].file;
        }
        else {
            this.binFileName = "unnamed.bas";
        }
    }

    _enbas(inputlines) {
        let result = [];
        let addr = 0x4301;

        for (let enc of ENCODINGS) {
            try {
                console.log(`Trying encoding ${enc}...`);
                for (let line = 0; line < inputlines.length; ++line) {
                    let text = inputlines[line].text;
                    //console.log("Input=[" + text + "]");
                    let tokens;
                    let gutobj = {
                        addr: addr,
                        hex: [],
                        error: null,
                        file: inputlines[line].file
                    };
                    [tokens, addr] = tokenize2(text.trim(), addr);
                    result = result.concat(tokens);
                    //if (tokens.length == 0) {
                    //    gutobj.error = "error";
                    //}

                    gutobj.hex = tokens;
                    if (!this.gutter_by_file[inputlines[line].file]) {
                        this.gutter_by_file[inputlines[line].file] = [];
                    }
                    this.gutter_by_file[inputlines[line].file].push(gutobj);
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

    getBinFileName()
    {
        return this.binFileName;
    }

    getTapFileName()
    {
        return Util.replaceExt(this.binFileName, ".cas");
    }

    // text: nest: integer, text: string
    gutter(text, lengths, addresses) 
    {
        let addr = 0;
        let nest = 0;

        let gutstack = [];
        gutstack.push([]);

        let by_file = {};
        let mainfile;

        for(let i = 0, end_i = text.length; i < end_i; i += 1) {
            let unresolved = false;
            let width = 0;
            let hexes = [];
            for (let b = 0; b < lengths[i]; ++b) {
                let bytte = this.mem[addresses[i]+b];
                if (bytte === undefined || bytte < 0) {
                    unresolved = true;
                    hexes[b] = -1;
                } 
                else {
                    hexes[b] = bytte;
                }
            }

            let err = this.errors[i] || unresolved !== false || this.cpp_errors[i];

            let gutobj = {
                addr : addresses[i],
                hex : hexes,
                error: err,
                file: text[i].file
            };

            if (!mainfile && text[i].nest == 0 && text[i].file) {
                mainfile = text[i].file;
            }

            if (text[i].nest == nest) {
                gutstack.at(-1).push(gutobj);   // just a normal line
            }
            else if (text[i].nest > nest) {     // next nest, can be several levels deep at once
                while (text[i].nest > nest) {
                    gutstack.push([]);          // next level gutter
                    nest += 1;
                }
                gutstack.at(-1).push(gutobj);   // push current line at its nest level
            }
            else {
                // go up: collect inner hexes
                let innerhex = []; 
                let inneraddr;
                let innererr = false;
                while (text[i].nest < nest) {
                    let inner = gutstack.pop(); // current nest
                    if (inner.length > 0) {
                        if (!by_file[inner[0].file]) {
                            by_file[inner[0].file] = inner;   // save inner gutter
                        }
                    }

                    let [h, err] = unwrap_inner_gutter(inner);
                    innerhex.push(...h);
                    if (err && !innererr) {
                        innererr = err;
                    }
                    inneraddr = inner.length > 0 ? inner[0].addr : 0;
                    nest -= 1;
                }
                gutstack.at(-1).push({addr: inneraddr, hex: innerhex, error: innererr});
                gutstack.at(-1).push(gutobj);
            }
        }

        if (gutstack[0].length > 0) {
            by_file[mainfile] = gutstack[0];
        }

        return [gutstack[0], by_file];
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
                'gutter':{},
                'by_file':bas.gutter_by_file,
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
