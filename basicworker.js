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
        this.sourceFileName = "unnamed.bas";
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

        this.sourceFileName = "unnamed.bas";
        if (fulltext && fulltext.length > 0) {
            this.sourceFileName = fulltext[0].file;
        }
        else {
            this.sourceFileName = "unnamed.bas";
        }
    }

    _enbas(inputlines) {
        let result = [];
        let addr = 0x4301;

        for (let enc of ENCODINGS) {
            try {
                //console.log(`Trying encoding ${enc}...`);
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

                    gutobj.hex = tokens;
                    let file_gutter = this.gutter_by_file[inputlines[line].file];
                    let file_line_num = inputlines[line].line_num;
                    if (!file_gutter) {
                        file_gutter = [];
                        this.gutter_by_file[inputlines[line].file] = file_gutter;
                    }
                    while (file_gutter.length <= file_line_num) 
                        file_gutter.push({addr: addr, hex:[], error: null, file: inputlines[line].file});
                    //file_gutter.push(gutobj);
                    file_gutter[file_line_num] = gutobj;
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
        return Util.replaceExt(this.sourceFileName, ".bas");;
    }

    getTapFileName()
    {
        return Util.replaceExt(this.sourceFileName, ".cas");
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
