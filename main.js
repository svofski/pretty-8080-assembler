/*jshint sub:true*/

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
// Rev.L: use assembler worker, support base64 strings
// Rev.M: version 2.0 integrates editor and listing, old stuff thrown away
//
// TODO: evaluation should ignore precedence, it's all left-to-right
//

var assembler;
var assemblerWorker = new Worker('assembler.js');
var basicWorker = new Worker('basicworker.js');

// -- global DOM elements

var debug = false;
var scrollHistory = []; 
var inTheOpera = navigator.appName.indexOf('Opera') != -1;

function Asmcache() {
    this.binFileName = "";
    this.mem = [];
    this.org = 0;
    this.references = [];
    this.textlabels = [];
    this.binFileName = "";
    this.labels = [];
    this.xref_by_file = {};
    this.addr_to_label = {};
}
var asmcache = new Asmcache();

function updateReferences(xref, xref_by_file, labels, org) {
    asmcache.xref = xref;
    asmcache.xref_by_file = xref_by_file;
    asmcache.labels = labels;
    asmcache.org = org || 256;

    asmcache.addr_to_label = {};
    for (let label in labels) {
        let addr = labels[label];
        asmcache.addr_to_label[addr] = label;
    }
}

var listing_listener_added = {};
var hex2bin_listener_added = {};
var play_listener_added = false;

var player = undefined;
let current_emulator = null;
let program_load = null;
let dump_scroller = null;
let dasm_scroller = null;
let disassembled_window = [];
let debugger_extra_breakpoints = {};
let cpu_state = {};

// http://stackoverflow.com/a/9458996/128597
function _arrayBufferToBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function generateDataURI() {
    var encoded = _arrayBufferToBase64(assembler.mem);
    var contentType = "application/octet-stream";
    return "data:" + contentType + ";base64," + encoded;
}

function getReferencedLabel(lineno) {
    var refto = asmcache.references[lineno];
    if (refto !== undefined) {
        var sought = asmcache.textlabels.indexOf(refto.toLowerCase());
        return document.getElementById("label" + sought);
    }
    return undefined;
}

function getReferencingLines(lineno) {
    var refs = [];
    var fullrefs = [];
    var label = asmcache.textlabels[lineno];
    if (label !== undefined) {
        for(var i = 0; i < asmcache.references.length; i++) {
            if (asmcache.references[i] === label) {
                var element = document.getElementById("code" + i);
                refs[refs.length] = element;
                element = document.getElementById("l" + i);
                fullrefs[fullrefs.length] = element;
            }
        }
    }
    referencingLinesFull = fullrefs;
    return refs;
}

function getLabelForAddr(addr) {
    //return Object.keys(asmcache.labels).find(key => asmcache.labels[key] === addr);
    return asmcache.addr_to_label[addr];
}

var last_src = null;
let stats_timer = null;
let error_lines = [];
let current_error = -1;

function getMode()
{
    for (let f in project.files) {
        const filename = f.toLowerCase();
        if (filename.endsWith(".bas") || filename.endsWith(".asc")) {
            return "bas";
        }
        break;
    }
    return "asm";
}

function getWorker()
{
    let worker = assemblerWorker;
    if (getMode() == "bas") {
        worker = basicWorker;
    }
    return worker;
}

// assembler main entry point
function assemble() {
    //var src = editor.session.getLines(0, editor.session.getLength()).join("\n");

    //if (last_src === src) {
    //    return;
    //} 

    
    let worker = getWorker();
    if (worker) {
        //last_src = src;

        worker.postMessage({'command': 'assemble', 'project': project});
        if (!listing_listener_added[getMode()]) {
            listing_listener_added[getMode()] = true;
            worker.addEventListener('message',
                    function(e) {
                        if (e.data['kind'] !== 'assemble') return;
                        //var gut = e.data['gutter'] || [];
                        //editor.session.gutter_contents = gut;

                        let num_errors = 0;
                        error_lines = [];

                        const by_file = e.data['by_file'] || [];
                        for (let file in by_file) {
                            let s = sessions[file];
                            let annotations = [];
                            if (s) {
                                s.gutter_contents = by_file[file];

                                let mrkrs = s.mymarkers || [];
                                for (let i = 0; i < mrkrs.length; ++i) {
                                    s.removeMarker(mrkrs[i]);
                                }
                                s.mymarkers = [];

                                for (let i in s.gutter_contents) {
                                    let err = s.gutter_contents[i].error;
                                    if (err === true) {
                                        err = "Unresolved reference or bad numeric constant";
                                    }
                                    if (err) {
                                        ++num_errors;
                                        error_lines.push([file, i]);
                                        s.mymarkers.push(
                                            s.addMarker(new Range(i,0,i,1),
                                                "error_marker", "fullLine"));
                                            annotations.push({
                                                row: i,
                                                column: 40,
                                                text: err,
                                                type: "error"
                                            });
                                    }
                                }
                                s.setAnnotations(annotations);
                            }
                        }

                        editor.resize(true);
                        const labels = e.data['labels'];
                        const xref = e.data['xref'];
                        const xref_by_file = e.data['xref_by_file'];
                        const org = e.data['org'];
                        updateReferences(xref, xref_by_file, labels, org);
                        autotranslate = false;

                        // debounce stats update
                        if (stats_timer) {
                            clearTimeout(stats_timer);
                        }
                        stats_timer = setTimeout(function() {
                            let stats = document.getElementById("stats");
                            stats.innerText = `${num_errors} errors`;
                            if (num_errors > 0) {
                                stats.classList.add("error");
                                stats.title = "Click to jump to the next error";
                            }
                            else {
                                stats.classList.remove("error");
                                stats.title = "";
                            }
                        }, 1000);

                        // update gui buttons
                        updateButtons(e.data);
                    });
        }
    } else if (assembler) {
        assembler.assemble(src);
        //last_src = src;
        autotranslate = false;
    }
}

function gotoError()
{
    if (error_lines.length > 0) {
        current_error = (current_error + 1) % error_lines.length;
        
        let [file, line] = error_lines[current_error];
        switchFile(file);
        editor.scrollToLine(line, /*center*/true, /*animate*/true);
    }
}


// automatic assembler launcher

var autotranslate = false;

function keypress(e) {
    cock(250);
}

function cock(timeout) {
    if (autotranslate) {
        clearTimeout(autotranslate);
    }
    autotranslate = setTimeout(function() {
        assemble();
    }, timeout);
}


function keydown(e) {
    if (e.keyCode === 9) {
        var obj = document.getElementById('source');
        var savedScroll = obj.scrollTop;
        /* Find the Start and End Position */
        var start = obj.selectionStart;
        var end   = obj.selectionEnd;

        /* Remember obj is a textarea or input field */
        obj.value = obj.value.substr(0, start) + 
            "\t" +
            obj.value.substr(end, obj.value.length);
        obj.setSelectionRange(start+1,start+1);
        obj.scrollTop = savedScroll;

        return false;
    }
    return true;
}

// backreferences window
var backrefTimeout = false;
var referencingLinesFull = [];

function boo() {
    document.body.innerHTML = 
        '<h1>Unfortunately&#0133;</h1>' +
        '<p>The <b>Pretty 8080 Assembler</b> only works in Internet Browsers.</p>' +
        '<p>You\'re using Microsoft Internet Explorer, which was called an "internet browser" by mistake.</p>' +
        '<p>Please upgrade and come back with a Firefox, Iceweasel, Konqueror, Safari, Chrome or even Opera.</p>' +
        '<p>Or try b2m\'s <a href="http://bashkiria-2m.narod.ru/i8080.html">Good i8080 Assembler</a>.</p>';
}

var emulator_sideload;

var getmemCallback = function(e) {};

var hex2binCallback = function(e) {};

function binaryMessageListener(e) {
    if (e.data['mem'] && !e.data['download']) {
        asmcache.binFileName = e.data['binFileName'];
        asmcache.mem = e.data['mem'];
        asmcache.org = e.data['org'];
        asmcache.tapeFormat = e.data['tapeFormat'];
        getmemCallback();
    }
}

// Function to download data to a file
function __download(data, filename, type) {
    var a = document.createElement("a"),
    file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

function hex2binMessageListener(e) {
    var mem = e.data['mem'];
    if (!mem) return;
    var filename = e.data['filename'];
    var tapeformat = e.data['tapeFormat'];
    var data = new Uint8Array(mem.length);
    var start = e.data['org'];
    var end = mem.length;
    for (var i = start, end = data.length; i < end; ++i) {
        data[i] = 0xff & mem[i];
    }

    switch (e.data['download']) {
        case 'bin':
            if (e.data.extra === 'r') {
                run_emulator(data.slice(start, end), filename, tapeformat, start);
            }
            else {
                __download(data.slice(start, end), filename,
                    "application/octet-stream");
            }
            break;
        case 'hex':
            __download(e.data['hex'], filename, "text/plain");
            break;
        case 'tap':
            var stream = new TapeFormat(tapeformat, true).format(data.slice(start, end), start, filename);
            if (e.data.extra === 'r') {
                run_emulator(stream.data, filename, tapeformat, start);
            }
            else {
                __download(stream.data, filename, "application/octet-stream");
            }
            break;
    }
}

/* Downloadable blob */
function load_hex2bin(format) {
    if (!hex2bin_listener_added[getMode()]) {
        hex2bin_listener_added[getMode()] = true;
        getWorker().addEventListener('message', hex2binMessageListener, 
                false);
    }
    getWorker().postMessage({'command': 'get' + format});
}

function play_audio(stream) {
    var bob = new Blob([stream], {type:'audio/wav'});
    var URLObject = window.webkitURL || window.URL;
    var url = URLObject.createObjectURL(bob);
    if (!player) {
        player = document.createElement("AUDIO");
    }
    player.setAttribute("src", url);
    player.volume = 0.25;
    player.play();
    player.onended = function() {
        stop_audio();
    };

    var button = document.getElementById("wav-play");
    if (button) {
        button.innerHTML = "◼";
        button.onclick = function() {
            stop_audio();
        }
    }
}

function stop_audio() {
    if (player) {
        player.pause();
    }
    var button = document.getElementById("wav-play");
    if (button) {
        button.innerHTML = "▶";
        button.onclick = function() {
            load_play("play");
        }
    }
 }

function load_play(moda) {
    if (!play_listener_added) {
        play_listener_added = true;
        (function(asmcache) {
            getWorker().addEventListener('message',
                    function (e) {
                        var dlmode = e.data['download'];
                        var stream;
                        if (dlmode === "wav" || dlmode === "play" || dlmode === "emu") {
                            asmcache.binFileName = e.data['binFileName'];
                            asmcache.mem = e.data['mem'];
                            asmcache.org = e.data['org'];
                            asmcache.tapeFormat = e.data['tapeFormat'];
                            var start = asmcache.org;
                            var end = asmcache.mem.length;
                            var data = new Uint8Array(asmcache.mem.length);
                            for(var i = start, end = data.length; i < end; ++i) 
                            {
                                data[i] = 0xff & asmcache.mem[i];
                            }
                            stream = TapeFormat(asmcache.tapeFormat).
                                    format(data.slice(start, end), asmcache.org,
                                        asmcache.binFileName).makewav();
                        }
                        if (dlmode === "wav") {
                           __download(stream, asmcache.binFileName + ".wav",
                                    "audio/wav");
                        } else if (dlmode === "play") {
                            /* start audio player */
                            play_audio(stream);
                        } else if (dlmode === "emu") {
                            run_emulator(stream, "program.wav", "v06c-rom");
                        }
                    },
                    false)
        })(asmcache);
    }
    getWorker().postMessage({'command': 'getwav', 'mode': moda});
}

let close_emulator_cb = null;

function tapeformat_to_emu80_platform(tf)
{
    switch (tf) {
        case "rk-bin":
            return "rk86";
        case "v06c-rom":
            return "vector";
        case "v06c-cload":
            return "vector";
        case "microsha-bin":
            return "mikrosha";
        case "apogee-bin":
        case "apogey-bin":
        case "apogej-bin":
            return "apogey";
        case "partner-bin":
            return "partner";
        case "ÓÐÅÃÉÁÌÉÓÔß-rks": // КОИ-8Ъ
        case "spetsialist-rks":
        case "specialist-rks":
        case "spec-rks":
            return "spec";

        case "micro80-bin":
        case "mikro80-bin":
            return "mikro80";
        case "ut88-bin":
            return "ut88";
        case "kr04-bin":
            return "kr04";
        case "palmira-bin":
            return "palmira";
        case "orion-rko":
        case "orion-ord":
        case "orion-bru":
            return "orion";
        case "okean-bin":
        case "okeah-bin":
            //return "okean240";
            break;
    }

    return null;
}

function tapeFormatSupported(tf)
{
    return tapeformat_to_emu80_platform(tf) ? true : false;
}


function run_emulator(bytes, filename, tapeformat, start_addr)
{
    if (debug.visible() && debug.stopped) {
        debug.animate_stop_button();
    }

    if (tapeformat.startsWith("v06c")) {
        run_vector06js(bytes, filename);
    }
    else {
        let stream = new TapeFormat(tapeformat, true).format(bytes, start_addr, filename);

        const platform = tapeformat_to_emu80_platform(tapeformat);
        if (platform) {
            run_emu80(stream.data, filename + ".cas", platform);
        }
    }

    let emulator_pane = $("#emulator");
    emulator_pane.classList.add("visible");
    if (options.emulator_docked) {
        emulator_pane.classList.add("docked");
    }
    else {
        emulator_pane.classList.remove("docked");
    }

    close_emulator_cb = () => {
        let iframe = $("#emulator-iframe");
        let container = $("#emulator-container");
        container.removeChild(iframe);
        emulator_pane.classList.remove("visible");
        blinkCount = 16;
        close_emulator_cb = null;
        editor.focus();
        closedEmulator();
        setTimeout(() => attach_divider_stuff(), 100);
        debug.stopped = false;
    };

    let close_btn = document.getElementById("close");
    close_btn.onclick = function() {
        close_emulator_cb && close_emulator_cb();
    };

    // toggle docked emulator
    let dock = document.getElementById("dock-emu-btn");
    dock.onclick = function(e) {
        e.preventDefault();
        emulator_pane.classList.toggle("docked");
        options.emulator_docked = emulator_pane.classList.contains("docked");
        saveState();
        setTimeout(() => attach_divider_stuff(), 100);
    };

    attach_divider_stuff();
}

function set_emulator_version(str)
{
    const ver_div = document.getElementById("emu-version");
    if (ver_div) {
        ver_div.innerText = str;
    }
}

function set_emulator_help(str)
{
    const help_div = document.getElementById("emu-help");
    if (help_div) {
        help_div.innerText = str;
    }
}

// updates emulator aspect and sets initial divider position
function update_aspect(iframe, set_divider)
{
    if (current_emulator === "vector") {
        $("#emulator-container").style.aspectRatio = "4/3";
    }
    else {
        if (iframe && iframe.contentDocument) {
            const canvas = iframe.contentDocument.getElementById("canvas");
            if (canvas) {
                let width = canvas.width;
                let height = canvas.height;
                $("#emulator-container").style.aspectRatio = width + "/" + height;
            }
        }
    }

    if (set_divider) {
        // adjust divider to debugger width
        if (options.emulator_docked) {
            let left = 1 - debug.get_preferred_width() / window.innerWidth;
            divider_set(0);
            divider_set(left * 100);
        }
    }
};


function run_emu80(bytes, filename, platform)
{
    let url = Util.url_without_query();

    program_load = (iframe, first_time = false) =>
    {
        const emu_version = iframe.contentDocument.title;
        set_emulator_version(emu_version);

        let meta = iframe.contentDocument.querySelector('meta[name="helptext"]');
        if (meta) {
            set_emulator_help(meta.content);
        }

        $("#spinner-holder").classList.add("hidden");

        const file = new File([bytes], filename, { type: "application/octet-stream" });
        debug.set_breakpoints(iframe.contentWindow);
        iframe.contentWindow.postMessage({cmd: "input", subcmd: "help"}, url); // request help
        iframe.contentWindow.postMessage({cmd: "loadfile", file}, url);

        if (first_time) {
            update_aspect(iframe, true);
        }
    };

    let emulator_pane = document.getElementById("emulator");
    let container = document.getElementById("emulator-container");
    let iframe = document.getElementById("emulator-iframe");
    if (iframe && current_emulator !== platform) {
        if (close_emulator_cb) {
            close_emulator_cb();
        }
        else {
            container.removeChild(iframe);
        }
        iframe = null;
    }

    if (!iframe) {
        iframe = document.createElement("iframe");
        let src_url = `${Util.url_without_query()}/emu80-build/emuframe.html?platform=${platform}`;

        iframe.src = src_url;
        iframe.id = "emulator-iframe";
        container.appendChild(iframe);
        initEmu80Iframe(iframe);
        current_emulator = platform;
        set_emulator_version("Loading...");
        set_emulator_help("");
        $("#spinner-holder").classList.remove("hidden");
    }
    else {
        program_load(iframe);
    }

    // emu80 does not yet support step out
    debug.force_disable_button("dbg-step-out-btn", true);

    iframe.onload = function() {
        iframe.contentWindow.focus();
        iframe.contentDocument.addEventListener("keydown", (e) => {
            if (testHotKey(e, "launch-emulator")) {
                close_emulator_cb && close_emulator_cb();
            }
        });

        // update aspect ratio
        const canvas = iframe.contentDocument.getElementById("canvas");
        const resizeObserver = new ResizeObserver((entries) => {
            update_aspect(iframe, false);
        });
        resizeObserver.observe(canvas);

        debug.show(true);
    };
    debug.update_controls(); // need to call it if frame was already loaded
}

function inputConfigResponse(data)
{
    console.log("emulator input help: ", data);
    let keys = $("#emu-help");
    keys.innerHTML = "";

    for (let key of data.data) {
        let div = document.createElement("div");
        div.className = "button-like";
        div.addEventListener('mousedown', (e) => {
            emulator_key_down(key.keycode);
        });
        div.addEventListener('mouseup', (e) => {
            emulator_key_up(key.keycode);
        });
        div.innerText = `${key.name_guest}: ${key.name_host}`;

        keys.appendChild(div);
    }
}

function emulator_key_down(keycode)
{
    let target = debugger_target();
    if (target) {
        target.postMessage({cmd: "input", subcmd: "keydown", keycode: keycode});
        target.focus();
    }
}

function emulator_key_up(keycode)
{
    let target = debugger_target();
    if (target) {
        target.postMessage({cmd: "input", subcmd: "keyup", keycode: keycode});
        target.focus();
    }
}

function run_vector06js(bytes, filename) {
    let url = Util.url_without_query();

    program_load = (iframe, first_time = false) => //, bytes, filename) =>
    {
        const emu_version = iframe.contentDocument.title;
        set_emulator_version(emu_version);

        let meta = iframe.contentDocument.querySelector('meta[name="helptext"]');
        if (meta) {
            set_emulator_help(meta.content);
        }

        const file = new File([bytes], filename, { type: "application/octet-stream" });
        debug.set_breakpoints(iframe.contentWindow);
        iframe.contentWindow.postMessage({cmd: "input", subcmd: "help"}, url); // request help
        iframe.contentWindow.postMessage({cmd: "loadfile", file}, url);

        if (first_time) {
            update_aspect(iframe, true);
        }
    };


    let emulator_pane = document.getElementById("emulator");
    let container = document.getElementById("emulator-container");
    let iframe = document.getElementById("emulator-iframe");
    if (iframe && current_emulator !== "vector") {
        if (close_emulator_cb) {
            close_emulator_cb();
        }
        else {
            container.removeChild(iframe);
        }
        iframe = null;
    }

    if (!iframe) {
        iframe = document.createElement("iframe");
        let src_url = `${url}/vector06js?i+`;
        iframe.src = src_url;
        iframe.id = "emulator-iframe";
        container.appendChild(iframe);
        current_emulator = "vector";
        set_emulator_version("Loading...");
        set_emulator_help("");
    }
    else {
        program_load(iframe);
    }

    window.parent.fullscreen = () => {};

    // remove step-out force disable after emu80
    debug.force_disable_button("dbg-step-out-btn", false);


    iframe.onload = function() {
        iframe.contentWindow.focus();
        iframe.contentDocument.addEventListener("keydown", (e) => {
            if (testHotKey(e, "launch-emulator")) {
                close_emulator_cb && close_emulator_cb();
            }
        });

        debug.show(true);
    };
    debug.update_controls(); // need to call it if frame was already loaded
}

var blksbr;
var blinkCount = 16;
var ruslat_light;

function registerHooks(hooks) {
    for (var name in hooks) {
        if (name === 'sideload') {
            emulator_sideload = hooks[name];
        }
        if (name === 'blksbr') {
            blksbr = hooks[name];
        }
    }
}

function ruslat(on) {
    if (!ruslat_light) {
        ruslat_light = document.getElementById("ruslat");
    }
    if (!on && blksbr && blinkCount > 0 && --blinkCount === 0) {
        setTimeout(function() { 
            blksbr(false); 
            blksbr = null; 
        }, 0);
    }
    ruslat_light.className = on ? "on" : "";
}

function autoload()
{
    try {
        let src = sessionStorage.getItem("source");
        if (src) {
            editor.setValue(src, 0);
            editor.clearSelection();
            let cur_row = sessionStorage.getItem("cursor_position_row");
            let cur_column = sessionStorage.getItem("cursor_position_column");
            console.log("autoload cursor_position:", cur_row, cur_column);
            editor.moveCursorTo(cur_row, cur_column);
            editor.scrollToRow(sessionStorage.getItem("first_visible_row"));
            editor.focus();
            assemble();
        }
    } catch(err) {
        console.log("autoload failed", err);
    }
}

function autosave()
{
    try {
        var src = editor.session.getLines(0, editor.session.getLength()).join("\n");
        sessionStorage.setItem("source", src);
        let cur = editor.getCursorPosition();
        sessionStorage.setItem("cursor_position_row", cur.row);
        sessionStorage.setItem("cursor_position_column", cur.column);
        sessionStorage.setItem("first_visible_row", editor.getFirstVisibleRow());
    } catch(err) {
        console.log("autosave failed", err);
    }
}

// update buttons based on assembler results
function updateButtons(asmresult)
{
    let run = document.getElementById("run");
    let wav_emu = document.getElementById("wav-emu");
    if (tapeFormatSupported(asmresult.tapeFormat)) {
        run && run.classList.remove("disabled");
    }
    else {
        run.classList.add("disabled");
    }

    let platform = tapeformat_to_emu80_platform(asmresult.tapeFormat);
    if (platform === "vector") {
        wav_emu && wav_emu.classList.remove("disabled");
    }
    else {
        wav_emu.classList.add("disabled");
    }
}

function runEmulator()
{
    var run = document.getElementById("run");
    if (getMode() === "asm") {
        load_hex2bin('bin,r');
    }
    else {
        load_hex2bin('tap,r');
    }
    //run.classList.add("disabled");
}

function runEmulatorWav()
{
    load_play("emu");
    let run = document.getElementById("run");
    run.classList.add("disabled");

    enableBobinage(true);
}

function enableBobinage(enable)
{
    document.querySelectorAll(".reel").forEach(item => {
        if (enable) {
            item.classList.add("bobinage");
        }
        else {
            item.classList.remove("bobinage");
        }
    });
}

function closedEmulator()
{
    let run = document.getElementById("run");
    run.className = run.className.replace(/ disabled/g, "");

    enableBobinage(false);
}

let UserOS = 
    (() => {
        const platform = navigator.userAgentData?.platform || navigator.platform || "unknown";

        if (/Win/i.test(platform)) return "Windows";
        if (/Mac/i.test(platform)) return "macOS";
        if (/Linux/i.test(platform)) return "Linux";

        // fallback heuristics
        if (/Android/i.test(navigator.userAgent)) return "Android";
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "iOS";

        return "Unknown";
    })();

function testHotKey(e, test)
{
    const chr = String.fromCharCode(e.keyCode);
    switch (test) {
        case "launch-emulator":
            if (UserOS == "Windows" || UserOS == "Linux") {
                return e.ctrlKey && e.altKey && chr === "B";
            }
            else if (UserOS == "macOS") {
                return e.metaKey && e.altKey && (chr === "B" || chr === "C"); // because safari
            }
            break;
        case "switch-tab":
            let mod = false;
            if (UserOS === "Windows" && e.altKey && !e.ctrlKey) {
                mod = true;
            }
            if (UserOS === "macOS" && e.altKey && !e.metaKey) {
                mod = true;
            }
            if (UserOS === "Linux" && e.ctrlKey && !e.altKey) {
                mod = true;
            }
            if (mod) {
                let buf_num = "123456789".indexOf(chr);
                return buf_num >= 0 && buf_num <= 9;
            }
            break;
    }

    return false;
}

function tooltipForHotKey(test)
{
    switch (test) {
        case "launch-emulator":
            if (UserOS === "Windows" || UserOS === "Linux") return Vim == null ? "Ctrl+Alt+B" : "Ctrl+Alt+B, :run";
            else if (UserOS === "macOS") return Vim == null ? "⌘⌥B" : "⌘⌥B, :run";
            break;
        case "switch-tab":
            if (UserOS === "Windows") return "Alt+";
            else if (UserOS === "Linux") return "Ctrl+";
            else if (UserOS === "macOS") return "⌥+";
            break;
    }
    return "";
}

function windowMessageListener(e)
{
    let iframe = $("#emulator-iframe");
    if (e.data.type === "ready" && iframe && iframe.contentWindow) {
        program_load(iframe, true);
    }
    else if (e.data.type === "tape_stopped") {
        enableBobinage(false);
    }
    else if (e.data.type === "debugger") {
        debuggerResponse(e.data);
    }
    else if (e.data.type === "input") {
        inputConfigResponse(e.data);
    }
}

function loaded() {
    if (navigator.appName === 'Microsoft Internet Explorer' || 
            navigator.appVersion.indexOf('MSIE') != -1) {
        boo();
        return false;
    }

    AceHook();
    IdeStart();

    i18n();

    if (window) {
        window.onbeforeunload = function() {
            autosave();
        }
    }

    autoload();

    //editor.session.on('change', keypress);

    var translate = document.getElementById('dl-bin');
    if (translate) {
        translate.onclick = function() {
            load_hex2bin('bin');
        };
    }

    var hexlate = document.getElementById('dl-hex');
    if (hexlate) {
        hexlate.onclick = function() {
            load_hex2bin('hex');
        };
    }

    var taplate = document.getElementById('dl-tape');
    if (taplate) {
        taplate.onclick = function() {
            load_hex2bin('tap');
        };
    }

    var run = document.getElementById("run");
    if (run) {
        run.onclick = function() {
            runEmulator();
        };
    }

    // global shortcuts handler
    document.addEventListener("keydown", (e) => {
        const chr = String.fromCharCode(e.keyCode);
        //console.log("document.keyDown", e, " chr=", chr);
        // ctrl+alt+b to launch emulator (also :run)
        if (testHotKey(e, "launch-emulator")) {
            let run_button  = document.getElementById("run");
            let emulator = document.getElementById("emulator");
            let docked = emulator.classList.contains("docked");
            if (run_button) {
                if (docked) {
                    runEmulator();
                }
                else {
                    if (close_emulator_cb) {
                        close_emulator_cb();
                    }
                    else {
                        runEmulator();
                    }
                }
            }
        }
        // alt+1..9 to switch buffers
        if (testHotKey(e, "switch-tab")) {
            let buf_num = "123456789".indexOf(chr);
            switchFileNum(buf_num);
            e.preventDefault();
        }
    }, {capture: true});


    stop_audio();

    var wavdl = document.getElementById("wav-dl");
    if (wavdl) {
        wavdl.onclick = function() {
            load_play('wav');
        }
    }

    var wavemu = document.getElementById("wav-emu");
    if (wavemu) {
        wavemu.onclick = function() {
            runEmulatorWav();
        }
    }

    window.addEventListener("message", windowMessageListener);
    debug = new Debug(cpu_state);
    attach_debugger_controls();
    attach_divider_stuff();


    window.addEventListener('popstate', (event) => {
        console.log("popstate:", event, event.state);
        if (event.state) {
            if (event.state.dasm_scroller_startIndex !== undefined) {
                if (dasm_scroller) {
                    dasm_scroller.scrollToLine(event.state.dasm_scroller_startIndex);
                }
                event.preventDefault();
            }
        }
    });

    window.addEventListener('beforeunload', (e) => {
        event.preventDefault();
        event.returnValue = '';
    });

    cock(100);
}

// toolbar
var toolbarOpacity = 0;
var toolbarTimeout = false;

function magicToolbar(n) {
    var tulba = document.getElementById('toolbar');

    if (n === 0) {
        if (scrollHistory.length === 0) {
            // force hiding if no history
            n = 2;
        } else {
            tulba.style.cursor = 'pointer';
            clearTimeout(toolbarTimeout);
            toolbarTimeout = setTimeout(function() { magicToolbar(1); }, 100);
        }
    }

    if (n === 1) {
        toolbarOpacity += 0.2;
        tulba.style.opacity = toolbarOpacity;
        if (Math.abs(toolbarOpacity - 1.0) > 0.05) {
            clearTimeout(toolbarTimeout);
            toolbarTimeout = setTimeout(function() { magicToolbar(1); }, 50);
        }
    }

    if (n === 2) {
        tulba.style.cursor = 'default';
        if (toolbarOpacity > 0) {
            clearTimeout(toolbarTimeout);
            toolbarTimeout = setTimeout(function() { magicToolbar(3); }, 50);
        }
    }

    if (n === 3) {
        toolbarOpacity -= 0.4;
        if (toolbarOpacity < 0) toolbarOpacity = 0;
        tulba.style.opacity = toolbarOpacity;
        if (toolbarOpacity > 0) {
            clearTimeout(toolbarTimeout);
            toolbarTimeout = setTimeout(function() { magicToolbar(3); }, 50);
        }
    }
}

// -- i18n --
var languages = 
{
    "en":["Pretty 8080 Assembler", "Make Beautiful Code"],
    "se":["Fin 8080 assembler", "Översätt den snygga"],
    "ru":["Прекрасный ассемблер КР580ВМ80А", "Транслировать прелесть"],
    "uk":["Прекрасний асемблер КР580ВМ80А", "Транслювати принаду"],
    "es":["Bonito ensamblador de 8080", "Crear código precioso"],
    "fr":["L'assembleur jolie de 8080", "Créer un beau programme"],
    "nl":["Fraaie 8080 Assembler", "Vertaal dit juweel"],
    "de":["Schöne 8080 Assembler","Übersetze diese Schatz"],
    "fi":["Siev&auml; 8080 assembleri", "Tee kaunista koodia"],
    "dk":["Smuk 8080 Assembler","Skriv pæn kode"],
    "cz":["Dobrý 8080 Assembler","Kompilaci drahé"],
    "tr":["Temiz montajcı kodu 8080","Güzel kodu yapmak"],
    "ja":["美しい 8080アセンブラ","美しい コードをしよう"],
    "he":["8080 יופי של שפת סף","לקודד יופי של קידוד"],
    // Persian translation by Ali Asadzadeh, thanks Ali!
    "fa":["یک اسمبلر جالب برای 8080","کامپایل کردن این کد زیبا"]
};
// 🐟
var rybas = 
{
    "welcome": ["Главрыба", "test.asm", "test-res.inc", "defines.inc"],
    
    "rk": ["Радио-86РК", "hello-rk.asm"],

    "microsha": ["Микроша", "hello-microsha.asm"],

    "apogee": ["Апогей БК-01", "hello-apogee.asm"],

    "partner": ["Партнер 01.01", "hello-partner.asm"],

    "mikro80": ["Микро-80", "hello-micro80.asm"],
    
    "ut88": ["ЮТ-88", "hello-ut88.asm"],
    "kr04": ["Электроника КР-04", "hello-kr04.asm"],
    "palmira": ["Пальмира", "hello-palmira.asm"],
    
    "vector06c": ["Вектор-06ц: Hello, world!", "hello-v06c.asm"],

    "krista": ["Криста", "hello-krista.asm"],

    "specialist": ["Специалист", "hello-spec.asm"],

    "orion": ["Орион-128", "hello-orion.asm"],

    "okean": ["Океан-240 🌊", "hello-okean240.asm"],

    //"baboon-dissolve": ["Вектор-06ц: 🐒", "baboon-dissolve.asm"],
    "baboon-dissolve-multipart": ["Вектор-06ц: 🐒", "baboon-dissolve-multipart.asm", "baboon-picture.inc"],

    "line-ei": ["Вектор-06ц: быстрая линия", "line-ei.asm"],

    "circle": ["Вектор-06ц: окружность", "circle.asm"],
    "circlearc": ["Вектор-06ц: дуга", "circleArc.asm"],
    "circleellip": ["Вектор-06ц: эллипс", "circleClipAndEllip.asm"],
    "arkmus": ["Вектор-06ц: музон из Арканоида", "arkmus.asm"],
    "text80-color": ["Вектор-06ц: цветной текст 80 символов", "text80-color.asm"],
    "vi53player": ["Вектор-06ц: проигрыватель музыки на ВИ53", "vi53player.zip"],
    "basic": ["Бейсик Вектор-06ц: Hello, world!", "hello.asc"],
    "basic-rybov": ["Бейсик Вектор-06ц: показ рыбов", "rybov.asc", "rybov-data.asc"]
};

function load_ryba(url,extrafiles) 
{
    console.log("Trying to load ", url);
    if (window.loadryba_state && window.loadryba_state === "try-cors") {
        window.loadryba_state = "tried-and-failed";
    } else {
        window.loadryba_state = "try-cors";
    }

    let urls = [url];
    if (extrafiles) {
        urls = urls.concat(extrafiles);
    }

    project = {
        files: {},
        colors: {},
        current: null
    };

    let mkrequest = function(urls) {
        let url = urls[0];
        let oReq = j();
        oReq.open("GET", url, true);
        oReq.responseType = "text";
        if (url.toLowerCase().endsWith(".zip")) {
            oReq.responseType = "arraybuffer";
        }

        oReq.onload = function(oEvent) {
            window.loadryba_state = false;
            let status = oReq.status;
            if (status >= 200 && status < 300 || status === 304) {
                const filename = url.split("/").pop();
                if (filename && filename.toLowerCase().endsWith(".zip")) {
                    importProject([oReq.response]);
                    return;
                }
                if (project.current == null) {
                    newProject(false, filename, oReq.response);
                }
                else {
                    newFile(oReq.response);
                    renameFile("untitled.asm", filename);
                }

                let cdr = urls.slice(1);
                if (cdr && cdr.length) {
                    // load next file
                    mkrequest(cdr).send();
                }
                else {
                    // done
                    switchFile(Object.keys(project.files)[0]);
                    editor.clearSelection();
                    assemble();
                }
            }
        };
        oReq.onerror = function(oEvent) {
            if (url.startsWith("http://") || url.startsWith("https://")) {
                load_ryba("https://cors.io?" + url);
            }
        };

        return oReq;
    };


    mkrequest(urls).send();
}

function defaultProject(ask=true)
{
    //newProject(ask, "test.asm", default_ryba);
    if (newProject(ask, "test.asm", "")) {
        let glavryba = rybas["welcome"]
        let extrafiles = glavryba.slice(2);
        load_ryba(glavryba[1], extrafiles);
        editor.clearSelection();
    }
    assemble();
}

function getFishfulToken(e)
{
    const pos = e.getDocumentPosition();
    let token = e.editor.getSession().getTokenAt(pos.row, pos.column);

    if (token && token.type === "fish") return token;

    token = e.editor.getSession().getTokenAt(pos.row, pos.column+1);
    if (token && token.type === "fish") return token;
  
    return null;
}

function build_hierarchy_rybov()
{
    let platforms = {};

    for (let flatkey in rybas) {
        let r = rybas[flatkey];
        //console.log(r);
        let platform = r[0].split(':')[0];
        if (platforms[platform] === undefined) {
            platforms[platform] = [r];
        }
        else {
            platforms[platform].push(r);
        }
    }

    console.log("hierarchy rybov", platforms);

    return platforms;
}

function create_menu_item(descr)
{
    let item = document.createElement("div");
    item.setAttribute("class", "ryba-item");
    item.innerText = descr[0];

    if (descr[1].length) {
        let extrafiles = descr.slice(2);
        (function(href, extrafiles) {
            item.onclick = function() {
                popupDestructor(null);
                load_ryba(href, extrafiles);
            };
        })(descr[1], extrafiles);
    }

    return item;
}

function create_submenu(list)
{
    let submenu = document.createElement("div");
    submenu.className = "ryba-popup submenu hidden";
    for (let descr of list) {
        let parts = descr[0].split(':');
        if (parts.length > 1) {
            descr[0] = parts[1];
        }
        let item = create_menu_item(descr);
        submenu.appendChild(item);
    }
    return submenu;
}

function create_ryba_menu()
{
    let hierarchy = build_hierarchy_rybov();
    let shown_submenu;

    var menu = document.createElement("div");
    menu.setAttribute("id", "ryba-popup");
    menu.className = "ryba-popup";
    for (var platform in hierarchy) {
        //console.log("ryba ", k, rybas[k][0], rybas[k][1]);
        let rybas = hierarchy[platform];
        let item;
        if (rybas.length === 1) {
            item = create_menu_item(rybas[0]);
            item.addEventListener("mouseenter", () => {
                if (shown_submenu) {
                    shown_submenu.classList.add("hidden");
                    shown_submenu = null;
                }
            });
        }
        else {
            item = create_menu_item([platform, "", ""]);
            item.classList.add("more");
            let submenu = create_submenu(rybas);
            item.appendChild(submenu);

            item.addEventListener("mouseenter", () => {
                item.parentElement.parentElement.appendChild(submenu);

                let r = item.getBoundingClientRect();
                let item_padding = parseFloat(window.getComputedStyle(item).padding);
                let menu_border = parseFloat(window.getComputedStyle(menu).border);
                submenu.style = `left: ${r.right + item_padding + menu_border}px; top: ${r.top - item_padding - menu_border}px;`;

                submenu.classList.remove("hidden");
                shown_submenu = submenu;
            });
        }

        menu.appendChild(item);
    }

    menu.onmouseleave = function(e) {
        let other = e.relatedTarget;
        if (!other.classList.contains("ryba-popup")) {
            popupDestructor(null);
        }
    };
    
    var text = document.getElementById("source");
    (function(text, menu) {
        editor.on("mousemove", function(e) {
            let fish = getFishfulToken(e);
            editor.container.classList.toggle("cursor-default", !!fish);
        });
        editor.on("click", function(e) {
            const fish = getFishfulToken(e);
            if (fish) {
                e.preventDefault();
                editor.container.style.cursor = "pointer";
                let parnt = document.getElementById("textinput");
                if (parnt) {
                    parnt.appendChild(menu);
                    attachPopupDestructor();
                }


                menu.style.left = (e.clientX - 25) + "px";
                menu.style.top = (e.clientY - 25) + "px";
            }
        });
    })(text, menu);
}

function getProjectFromUrl()
{
    let ryba;
    let extryba;
    var explang = document.URL.split('?')[1];
    if (explang) {
        var params = explang.split(',');
        for (var i = 0; i < params.length; ++i) {
            var forcedlang = languages[params[i]];
            if (forcedlang) {
                messages = forcedlang;
            }
            if (params[i].startsWith("http://") || params[i].startsWith("https://")
                || params[i].startsWith("data:")) {
                extryba = params.slice(i).join(',');
            }
            ryba = rybas[params[i]];
        }
    }

    if (extryba) return ["External project", extryba];
    if (ryba) return ryba;
    return null;
}

function i18n() {
    var lang = navigator.language;
    if (lang !== undefined) lang = lang.split('-')[0];
    var explang = document.URL.split('?')[1];
    var messages = languages[lang];
    if (explang !== undefined) lang = explang;
    if (!messages) messages = languages["en"];

    let ryba = getProjectFromUrl();
    if (ryba) {
        let extrafiles = ryba.slice(2);
        load_ryba(ryba[1], extrafiles);
    }

    var m_header = messages[0];
    var m_button = messages[1];

    var header = document.getElementById('header-text');
    var baton = document.getElementById('baton');

    header.innerHTML = m_header;
    if (baton) baton.innerHTML = m_button;

    if (lang === 'he' || lang === 'fa') {
        header.style.textAlign = 'right';
        if (baton) baton.style.cssFloat = 'right';
        if (baton) baton.style.clear = 'right';
        document.getElementById('buttbr').style.cssFloat = 'right';
        document.getElementById('ta').style.cssFloat = 'right';
    }

    create_ryba_menu();
}

function attach_debugger_controls()
{
    let url = Util.url_without_query();
    document.querySelectorAll('[id^="dbg-"][id$="-btn"]')
        .forEach(item => {
            item.classList.add("button-like");
            let subcmd = item.attributes.debug_subcmd && item.attributes.debug_subcmd.value;
            if (subcmd) {
                item.onclick = (e) => {
                    debug.command(subcmd, url);
                    editor.session.removeMarker(debugger_position_marker);
                    debug.stopped = false;
                    debug.update_controls();
                };
            }
            else {
                item.classList.add("error-like");
            }
        });
    debug.update_controls();

    // gutter clicks
    editor.on("guttermousedown", function(e) {
        let domEvent = e.domEvent;
        let target = domEvent.target;
        if (target && target.className.indexOf("ace_gutter-cell") === -1)
            return;
        e.stop();   // like preventDefault but for ace
        var row = e.getDocumentPosition().row;
        var session = editor.getSession();
        session_toggle_breakpoint(session, row);
    });


    // virtual scroller for the dump / dbg-mem
    dump_scroller = new VirtualScroll('dbg-mem');
    dump_scroller.init(new DumpDataSource('mem-row'));

    dasm_scroller = new VirtualScroll('dbg-code');
    dasm_scroller.init(debug.dasm_data_source);

    // inplace input for the code window
    debug.attach_dbg_code_inplace();
}

function session_toggle_breakpoint(session, row)
{
    var breakpoints = session.getBreakpoints();

    if (session.gutter_contents[row].hex.length == 0) 
        return;

    if (breakpoints[row]) {
        session.clearBreakpoint(row);
        session_clear_breakpoint(session, row);
    }
    else {
        session.setBreakpoint(row);
        session_set_breakpoint(session, row);
    }
}

function find_addr_line(addr, exact = false)
{
    for (let file of Object.keys(sessions)) {
        let s = sessions[file];
        let gc = s.gutter_contents;
        if (gc.length === 0) continue;
        let low = 0;
        let high = gc.length - 1;

        if (addr < gc[low].addr || addr > gc[high].addr) continue;

        while (low < high) {
            let mid = Math.floor((low + high) / 2);
            const val = gc[mid].addr;
            if (val < addr) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }


        while (low < gc.length && gc[low].hex.length == 0) {
            ++low;
        }

        if (exact && (low >= gc.length || gc[low].addr !== addr)) 
            return [null, -1];

        return [file, low];
    }

    return [null, -1];
}

let debugger_position_marker = null;

function show_debugger_line(addr)
{
    let [file, line] = find_addr_line(addr);
    if (file && line >= 0) {
        switchFile(file);
        editor.scrollToLine(line, /* centered */true, true);
        editor.session.removeMarker(debugger_position_marker);
        debugger_position_marker = editor.session.addMarker(new Range(line,0,line,1), "debugger_position_marker", "fullLine");
    }
}

function can_show_editor_for_addr(addr)
{
    let [file, line] = find_addr_line(addr);
    if (file && line >= 0) {
        return true;
    }
    return false;
}

function show_editor_for_addr(addr)
{
    let [file, line] = find_addr_line(addr);
    if (file && line >= 0) {
        switchFile(file);
        editor.scrollToLine(line, /* centered */true, true);
    }
}

function debuggerResponse(data)
{
    switch (data.what) {
        case "stopped":
            debug.stopped = true;
            cpu_state = data.cpu_state;
            console.log("debugger stopped pc=", Util.hex16(cpu_state.pc), cpu_state);
            show_debugger_line(cpu_state.pc);
            debug.update_controls();
            debug.refresh_window(cpu_state, cpu_state.pc);
            break;
        case "ok":
            debug.stopped = true;
            cpu_state = data.cpu_state;
            console.log("debugger ok pc=", Util.hex16(cpu_state.pc), cpu_state);
            debug.update_controls();
            debug.refresh_window(cpu_state);
            break;
    }
}

function debugger_target()
{
    let iframe = $("#emulator-iframe");
    return iframe ? iframe.contentWindow : null;
}

function session_set_breakpoint(session, line)
{
    let target = debugger_target();
    if (!target || !session || !session.gutter_contents || session.gutter_contents.length < line) return false;

    let addr = session.gutter_contents[line].addr;
    target.postMessage({cmd: "debugger", subcmd: "set-breakpoints", addrs: [addr]});
    return true;
}

function session_clear_breakpoint(session, line)
{
    let target = debugger_target();
    if (!target || !session || !session.gutter_contents || session.gutter_contents.length < line) return false;

    let addr = session.gutter_contents[line].addr;
    target.postMessage({cmd: "debugger", subcmd: "del-breakpoints", addrs: [addr]});
    return true;
}

