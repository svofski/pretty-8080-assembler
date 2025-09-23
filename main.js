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
}
var asmcache = new Asmcache();

function updateReferences(xref, xref_by_file, labels, org) {
    asmcache.xref = xref;
    asmcache.xref_by_file = xref_by_file;
    asmcache.labels = labels;
    asmcache.org = org || 256;
}

var listing_listener_added = {};
var hex2bin_listener_added = {};
var play_listener_added = false;

var player = undefined;
let current_emulator = null;
let program_load = null;
let debugger_stopped = false;
let dump_scroller = null;
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
    cock(100);
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
    if (debugger_visible() && debugger_stopped) {
        debugger_animate_stop_button();
    }

    if (tapeformat.startsWith("v06c")) {
        return run_vector06js(bytes, filename);
    }
    else {
        let stream = new TapeFormat(tapeformat, true).format(bytes, start_addr, filename);

        const platform = tapeformat_to_emu80_platform(tapeformat);
        if (platform) {
            return run_emu80(stream.data, filename + ".cas", platform);
        }
    }

    console.log("run_emulator: can't decide what to run");
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

function run_emu80(bytes, filename, platform)
{
    program_load = (iframe, filename) =>
    {
        const emu_version = iframe.contentDocument.title;
        set_emulator_version(emu_version);

        let meta = iframe.contentDocument.querySelector('meta[name="helptext"]');
        if (meta) {
            set_emulator_help(meta.content);
        }

        const file = new File([bytes], filename, { type: "application/octet-stream" });
        emu80run(file);
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
        let src_url = `${location.href}/emu80-build/emuframe.html?platform=${platform}`;

        iframe.src = src_url;
        iframe.id = "emulator-iframe";
        container.appendChild(iframe);
        current_emulator = platform;
        set_emulator_version("Loading...");
        set_emulator_help("");
    }
    else {
        program_load(iframe, filename);
    }

    emulator_pane.classList.add("visible");
    if (options.emulator_docked) {
        emulator_pane.classList.add("docked");
    }
    else {
        emulator_pane.classList.remove("docked");
    }

    emu80OnNewFrame(iframe);

    close_emulator_cb = () => {
        container.removeChild(iframe);
        emulator_pane.classList.remove("visible");
        blinkCount = 16;
        close_emulator_cb = null;
        editor.focus();
        closedEmulator();
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
    };

    iframe.onload = function() {
        iframe.contentWindow.focus();
        iframe.contentDocument.addEventListener("keydown", (e) => {
            if (testHotKey(e, "launch-emulator")) {
                close_emulator_cb && close_emulator_cb();
            }
        });
        debugger_show(false);
    };
    update_debugger_controls(); // need to call it if frame was already loaded
}

function run_vector06js(bytes, filename) {
    program_load = (iframe) => //, bytes, filename) =>
    {
        const emu_version = iframe.contentDocument.title;
        set_emulator_version(emu_version);

        let meta = iframe.contentDocument.querySelector('meta[name="helptext"]');
        if (meta) {
            set_emulator_help(meta.content);
        }

        const file = new File([bytes], filename, { type: "application/octet-stream" });
        debugger_set_breakpoints(iframe.contentWindow);
        iframe.contentWindow.postMessage({cmd: "loadfile", file}, location.href);
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
        let src_url = `${location.href}/vector06js?i+`;
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

    window.parent.fullscreen = () => {
    };

    emulator_pane.classList.add("visible");
    if (options.emulator_docked) {
        emulator_pane.classList.add("docked");
    }
    else {
        emulator_pane.classList.remove("docked");
    }

    close_emulator_cb = () => {
        container.removeChild(iframe);
        emulator_pane.classList.remove("visible");
        blinkCount = 16;
        close_emulator_cb = null;
        editor.focus();
        closedEmulator();
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
    };

    iframe.onload = function() {
        iframe.contentWindow.focus();
        iframe.contentDocument.addEventListener("keydown", (e) => {
            if (testHotKey(e, "launch-emulator")) {
                close_emulator_cb && close_emulator_cb();
            }
        });
        debugger_show(true);
    };
    update_debugger_controls(); // need to call it if frame was already loaded
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
        program_load(iframe);
    }
    else if (e.data.type === "tape_stopped") {
        enableBobinage(false);
    }
    else if (e.data.type === "debugger") {
        debuggerResponse(e.data);
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
    attach_debugger_controls();

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
    
    "vector06c": ["Вектор-06ц", "hello-v06c.asm"],

    "krista": ["Криста", "hello-krista.asm"],

    "specialist": ["Специалист", "hello-spec.asm"],

    "okean": ["Океан-240 🌊", "hello-okean240.asm"],

    //"baboon-dissolve": ["Вектор-06ц: 🐒", "baboon-dissolve.asm"],
    "baboon-dissolve-multipart": ["Вектор-06ц: 🐒", "baboon-dissolve-multipart.asm", "baboon-picture.inc"],

    "line-ei": ["Вектор-06ц: быстрая линия", "line-ei.asm"],

    "circle": ["Вектор-06ц: окружность", "circle.asm"],
    "circlearc": ["Вектор-06ц: дуга", "circleArc.asm"],
    "circleellip": ["Вектор-06ц: эллипс", "circleClipAndEllip.asm"],
    "arkmus": ["Вектор-06ц: музон из Арканоида", "arkmus.asm"],
    "text80-color": ["Вектор-06ц: цветной текст 80 символов", "text80-color.asm"],
    "basic": ["Бейсик Вектор-06ц", "hello.asc"],
    "basic-rybov": ["Бейсик Вектор-06ц: multipart", "rybov.asc", "rybov-data.asc"]
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

        oReq.onload = function(oEvent) {
            window.loadryba_state = false;
            let status = oReq.status;
            if (status >= 200 && status < 300 || status === 304) {
                const filename = url.split("/").pop();
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

function create_ryba_menu()
{
    var menu = document.createElement("div");
    menu.setAttribute("id", "ryba-popup");
    for (var k in rybas) {
        console.log("ryba ", k, rybas[k][0], rybas[k][1]);
        var item = document.createElement("div");
        item.setAttribute("class", "ryba-item");
        item.innerText = rybas[k][0];
        let extrafiles = rybas[k].slice(2);
        (function(href, extrafiles) {
            item.onclick = function() {
                menu.parentElement.removeChild(menu);
                load_ryba(href, extrafiles);
            };
        })(rybas[k][1], extrafiles);
        menu.onmouseleave = function() {
            popupDestructor(null);
        };

       menu.appendChild(item);
    }
    
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
        load_ryba(document.URL.split('?')[0] + ryba[1], extrafiles);
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


function update_debugger_controls()
{
    let visible = debugger_visible();
    document.querySelectorAll('[id^="dbg-"][id$="-btn"]')
        .forEach(item => {
            if (!visible) {
                item.classList.add("disabled");
                return;
            }

            if (debugger_stopped) {
                item.classList.remove("disabled");
            }
            else {
                if (item.id != "dbg-pause-btn") {
                    item.classList.add("disabled");
                }
                else {
                    item.classList.remove("disabled");
                }
            }
        });
    if (debugger_stopped) {
        $("#debugger-sheet").classList.remove("disabled");
    }
    else {
        $("#debugger-sheet").classList.add("disabled");
    }
}

function debugger_animate_stop_button()
{
    let btn = $("#dbg-pause-btn");
    btn.classList.add("attract");
    setTimeout(function() {
        btn.classList.remove("attract");
    }, 1500);
}

class DumpDataSource
{
    constructor(row_class)
    {
        this.row_class = row_class;
        this.mem = [];
        this.row_count = 65536 / 16;
        this.refresh = null;
    }

    slice(start, end)
    {
        let data = [];
        for (let i = start; i < end; ++i) {
            let text = dump_line(i * 16, this.mem)
            data.push(text);
        }
        return data;
    }

    set_mem(mem)
    {
        this.mem = mem;
        this.refresh && this.refresh();
    }
}

function attach_debugger_controls()
{
    document.querySelectorAll('[id^="dbg-"][id$="-btn"]')
        .forEach(item => {
            item.classList.add("button-like");
            let subcmd = item.attributes.debug_subcmd && item.attributes.debug_subcmd.value;
            if (subcmd) {
                item.onclick = (e) => {
                    let iframe = $("#emulator-iframe");
                    iframe.contentWindow.postMessage({cmd: "debugger", subcmd: subcmd}, location.href);

                    editor.session.removeMarker(debugger_position_marker);
                    debugger_stopped = false;
                    update_debugger_controls();
                };
            }
            else {
                item.classList.add("error-like");
            }
        });
    update_debugger_controls();

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

    // inplace input for the code window
    attach_dbg_code_inplace();
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

        if (exact && gc[low].addr !== addr) 
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

function show_editor_for_addr(addr)
{
    let [file, line] = find_addr_line(addr);
    if (file && line >= 0) {
        switchFile(file);
        editor.scrollToLine(line, /* centered */true, true);
    }
}

function dump_line(addr, bytes)
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

function format_hexes(data, len, padding=12)
{
    let hexes = "";
    for (let i = 0; i < len; ++i) {
        hexes += Util.hex8(data[i]) + " ";
    }
    return hexes.padEnd(padding, " ");
}

function dass_at(s, pc, data, breakpoints)
{
    for (let i = 0; i < 3; ++i) {
        data[i] = s.mem[(pc + i) & 0xffff];
    }
    let dass = I8080_disasm(data);

    let hexes = format_hexes(data, dass.length);

    let cur = s.pc === pc ? "dbg-dasm-current" : "";
    if (breakpoints.indexOf(pc & 0xffff) != -1) {
        cur += " dbg-dasm-breakpoint";
    }
    let text = `<div class="dbgwin-text ${cur}">  ${Util.hex16(pc)}: ${hexes}${dass.text}</div>`;

    pc = pc + dass.length;

    return [text, pc];
}

function disassemble(s, set_addr)
{
    let breakpoints = debugger_collect_breakpoints();
    let data = new Uint8Array(3);
    let text = [];

    if (set_addr === undefined) set_addr = s.pc;

    let pc = set_addr;
    let das = "";
    text = [];
    for (let line = 0; line < 10; ++line) {
        [das, pc] = dass_at(s, pc, data, breakpoints);
        text.push(das);
    }

    //pc = (set_addr - 12) & 0xffff;
    pc = set_addr - 12;
    let pretext = [];
    let prepc = [];

    while (pc < set_addr) {
        prepc.push(pc & 0xffff);
        [das, pc] = dass_at(s, pc, data, breakpoints);
        pretext.push(das);
    }

    if (pc > set_addr) {
        pretext.pop();
        prepc.pop();
        pc = prepc[prepc.length - 1];

        let hexes = format_hexes(data, set_addr - pc - 1);
        let db = "DB " + hexes;
        pretext.push(`<div class="dbgwin-text">  ${Util.hex16(pc)}: ${hexes}${db}</div>`);
    }

    return pretext.slice(pretext.length - 4).concat(text);
}

function debugger_scroll_mem_to(addr)
{
    let mem = $("#dbg-mem");
    const metrics = Util.getCharMetrics(mem);

    const row = Math.max(0, Math.floor(addr / 16) - 2);
    mem.scrollTo(0, metrics.h * row);

}

function create_inplace_overlay(left, top, width, metrics)
{
    let overlay = document.createElement("input");
    overlay.id = "overlay";
    overlay.style.left = left + "px";
    overlay.style.top  = top  + "px";
    overlay.style.width = metrics.w * width + "px";
    overlay.style.height = metrics.h + "px";
    return overlay;
}

const MODE_ADDR = 0;
const MODE_BYTE = 1;

// a global inplace editor for dbg-mem view
let dbg_mem_inplace = null;
function attach_dbg_mem_inplace(dbg_mem, mem)
{
    const metrics = Util.getCharMetrics(dbg_mem);

    dbg_mem.removeEventListener("mousedown", dbg_mem_inplace);

    let open_inplace = function(mode, addr) {
        const row = Math.floor(addr / 16);
        const padding = Util.get_computed_padding(dbg_mem);
        const left = padding.left + (mode == MODE_ADDR ? 0 : (6 + (addr % 16) * 3) * metrics.w);
        const top  = /*padding.top +*/ row * metrics.h;

        let overlay = create_inplace_overlay(left, top, mode == MODE_ADDR ? 5 : 3, metrics);
        dbg_mem.appendChild(overlay);

        if (mode == MODE_ADDR) {
            let addr_text = Util.hex16(row * 16);
            overlay.value = addr_text;
        }
        else {
            let pos = 6 + (addr % 16) * 3;
            overlay.value = Util.hex8(mem[addr]);
        }

        let previousValue = overlay.value, originalValue = overlay.value;
        setTimeout(function() {
            overlay.focus();
            overlay.addEventListener('blur', () => {
                dbg_mem.removeChild(overlay);
            });
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    overlay.blur();

                    if (mode == MODE_ADDR) {
                        // Enter and Tab confirms the input
                        let addr = Util.parseHexStrict(overlay.value);
                        if (!isNaN(addr) && addr >= 0 && addr <= 0xffff) {
                            debugger_scroll_mem_to(addr);
                        }
                    }
                    else {
                        let val = Util.parseHexStrict(overlay.value);
                        if (!isNaN(val) && val >= 0 && val <= 0xff) {
                            debugger_write_byte(addr, val);
                        }
                        setTimeout(() => { open_inplace(mode, (addr + 1) & 0xffff); }, 50);
                    }
                }
                else if (e.key === 'Escape') {
                    e.preventDefault();
                    overlay.value = originalValue;
                    overlay.blur();
                }
            });
            attach_hex_validator(overlay, mode);
        }, 50);
    };

    // mad inplace editor in dbg-mem
    dbg_mem_inplace = function(e) {
        console.log(e);
        const rect = dbg_mem.getBoundingClientRect();
        const x = e.clientX - rect.left + dbg_mem.scrollLeft;
        const y = e.clientY - rect.top  + dbg_mem.scrollTop;

        const col = Math.floor(x / metrics.w);
        const row = Math.floor(y / metrics.h);

        console.log("dbg_mem_inplace click row", row, "col", col);

        let mode = MODE_ADDR, mem_addr; 
        let addr = row * 16;
        if (col > 54) {
            return;
        }
        if (col > 6) {
            mode = MODE_BYTE;
            addr += Math.floor((col - 7) / 3);
        }

        open_inplace(mode, addr);
    };

    dbg_mem.addEventListener("mousedown", dbg_mem_inplace);
}

function attach_hex_validator(input, mode)
{
    let previousValue = input.value, originalValue = input.value;
    input.addEventListener('input', (e) => {
        const trimlen = mode == MODE_ADDR ? 4 : 2;
        const maxval = mode == MODE_ADDR ? 0xffff : 0xff;
        if (input.value.length > trimlen) {
            input.value = input.value.slice(input.value.length - trimlen, input.value.length);
        }

        let n = Util.parseHexStrict(input.value);
        if (isNaN(n) || n < 0 || n > maxval) {
            input.value = previousValue;
        }

        previousValue = input.value;
    });

}

// input address
function attach_dbg_code_inplace()
{
    let dbg_code = $("#dbg-code");

    let open_inplace = function(row, col, addr) {
        const metrics = Util.getCharMetrics(dbg_code);
        const padding = Util.get_computed_padding(dbg_code);
        const left = padding.left + col * metrics.w;
        const top  = padding.top + row * metrics.h;

        let overlay = create_inplace_overlay(left, top, 5, metrics);
        dbg_code.appendChild(overlay);

        setTimeout(function() {
            overlay.focus();
            overlay.value = Util.hex16(addr);
            attach_hex_validator(overlay, MODE_ADDR);

            overlay.addEventListener('blur', () => {
                dbg_code.removeChild(overlay);
            });
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    overlay.blur();
                    let newaddr = Util.parseHexStrict(overlay.value);
                    render_code_window(newaddr);
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    overlay.blur();
                }
            });
        }, 50);
    };

    let dbg_code_inplace = function(e) {
        let dbg_code = $("#dbg-code");
        const padding = Util.get_computed_padding(dbg_code);
        let [row, col] = Util.getClickRowCol(e, dbg_code, padding.left, padding.top);

        let plaintext;
        if (row < disassembled_window.length) {
            const div = document.createElement("div");
            div.innerHTML = disassembled_window[row];
            plaintext = div.firstChild.innerText;
        }

        console.log("clicked in code at ", row, col, "text=", plaintext);

        if (col < 3 && plaintext) {
            let addr = Util.parseHexStrict(plaintext.slice(2, 2+4));
            debugger_toggle_breakpoint(addr);
        }
        else if (col >= 3 && col <=7 && plaintext) {
            let addr = Util.parseHexStrict(plaintext.slice(2, 2+4));
            open_inplace(row, 2, addr);
        }
    };

    dbg_code.addEventListener("mousedown", dbg_code_inplace);
}

function refresh_debugger_window(s)
{
    // regs
    let reg_af = (s.regs[7] << 8) | (s.psw);
    let reg_bc = (s.regs[0] << 8) | (s.regs[1]);
    let reg_de = (s.regs[2] << 8) | (s.regs[3]);
    let reg_hl = (s.regs[4] << 8) | (s.regs[5]);

    let mkreg = (name,val) => {
        return `<div class="dbgwin-text">${name}=<div class="dbgwin-clickable inline" dbg-reg="${name}" dbg-attr="register" contenteditable="true">${Util.hex16(val)}</div></div>`;
    };

    $("#dbg-registers").innerHTML = 
        mkreg("AF", reg_af) +
        mkreg("BC", reg_bc) +
        mkreg("DE", reg_de) +
        mkreg("HL", reg_hl) +
        mkreg("SP", s.sp) +
        mkreg("PC", s.pc);

    // psw flags
    let mkbit = (name,mask) => {
        let val = (s.psw & mask) ? 1 : 0;
        if (name === "IFF")
            val = s.iff ? 1 : 0;
        name = name.padStart(3, " ");
        return `<div class="dbgwin-text">${name}=<div class="dbgwin-clickable inline" dbg-mask="${mask}" dbg-attr="psw" dbg-bit="${name}" contenteditable="true">${val}</div></div>`;
    };

    let psw_text = 
        mkbit("C", 0x01) +
        mkbit("P", 0x04) +
        mkbit("Z", 0x40) +
        mkbit("S", 0x80) +
        mkbit("AC", 0x10) +
        mkbit("IFF", 0x00);

    $("#dbg-psw").innerHTML = psw_text;

    // stack
    let stack_text = "";
    for (let n = 0; n < 16; n += 2) {
        let sp2 = s.sp + n;
        let val = s.mem[sp2] | (s.mem[sp2 + 1] << 8);
        stack_text += `<div class="dbgwin-text">SP+${Util.hex8(n)}: <div class="dbgwin-clickable inline" dbg-attr="breakpoint">${Util.hex16(val)}</div></div>`;
    }
    $("#dbg-stack").innerHTML = stack_text;

    // breakpoints
    let bpt_text = "";
    for (let a in s.breakpoints) {
        bpt_text += `<div class="dbgwin-clickable" dbg-attr="breakpoint">${Util.hex16(a)}</div>`;
    }
    if (bpt_text.length == 0) {
        bpt_text = "<div>&nbsp;&nbsp;&nbsp;&nbsp;</div>";
    }
    $("#dbg-breakpoints").innerHTML = bpt_text;

    // mem
    $("#dbg-mem-header").innerText = "      .0 .1 .2 .3 .4 .5 .6 .7 .8 .9 .A .B .C .D .E .F    0123456789ABCDEF";
    let dbg_mem = $("#dbg-mem");
    let addr = dbg_mem.attributes.addr || 0; 

    // refresh data in the hex dump view
    dump_scroller && dump_scroller.data.set_mem(s.mem);
    attach_dbg_mem_inplace(dbg_mem, s.mem);


    // 
    // handlers for clickable items
    //

    // clicks on breakpoints in the debugger sheet
    document.querySelectorAll('[dbg-attr="breakpoint"]').forEach(item => {
        item.onclick = (e) => {
            let addr = parseInt('0x' + e.srcElement.innerText);
            if (!isNaN(addr) && addr >= 0 && addr <= 0xffff) {
                show_editor_for_addr(addr);
                render_code_window(addr);
            }
        };
    });


    // register inplace editor
    document.querySelectorAll('[dbg-attr="register"]').forEach(item => {
        let originalText;
        let previousText;
        item.addEventListener('focus', () => {
            previousText = originalText = item.innerText;
            //console.log("New value for: ", item.attributes["dbg-reg"], item.innerText);
            //debugger_set_register(item.attributes["dbg-reg"].value.toLowerCase(), "0x" + item.innerText);
        });
        item.addEventListener('blur', () => {
            console.log("New value for: ", item.attributes["dbg-reg"], item.innerText);
            debugger_set_register(item.attributes["dbg-reg"].value.toLowerCase(), Util.parseHexStrict(item.innerText));
        });

        item.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.srcElement.blur()
            }
            else if (e.key === 'Escape') {
                e.preventDefault();
                e.srcElement.innerText = originalText;
                e.srcElement.blur();
            }
        });

        item.addEventListener('input', function(e) {
            if (item.innerText.length > 4) {
                item.innerText = item.innerText.slice(item.innerText.length - 4, item.innerText.length);
            }

            let n = Util.parseHexStrict(item.innerText);
            if (isNaN(n) || n < 0 || n > 0xffff) {
                item.innerText = previousText;
            }

            // move caret to the end
            const range = document.createRange();
            range.selectNodeContents(item);
            range.collapse(false);
            const sel = window.getSelection();
            console.log(sel);
            sel.removeAllRanges();
            sel.addRange(range);

            previousText = item.innerText;
        });
    });

    document.querySelectorAll('[dbg-attr="psw"]').forEach(item => {
        let originalText;
        let previousText;
        item.addEventListener('focus', () => {
            previousText = originalText = item.innerText;
        });
        item.addEventListener('blur', () => {
            let name = item.attributes["dbg-bit"].value;
            let mask = parseInt(item.attributes["dbg-mask"].value);
            let on = item.innerText === "1";

            if (name === "IFF") {
                debugger_set_register("iff", on ? 1 : 0);
                return;
            }

            let psw = (s.psw & ~mask) | ((on ? mask : 0));
            let reg_af = (s.regs[7] << 8) | psw;

            debugger_set_register("af", reg_af);
        });

        item.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.srcElement.blur()
            }
            else if (e.key === 'Escape') {
                e.preventDefault();
                e.srcElement.innerText = originalText;
                e.srcElement.blur();
            }
        });

        item.addEventListener('input', function(e) {
            if (item.innerText.length > 1) {
                item.innerText = item.innerText.slice(item.innerText.length - 1, item.innerText.length);

                if (item.innerText.length && "01".indexOf(item.innerText[0]) < 0) {
                    item.innerText = previousText;
                }

                // move caret to the end
                const range = document.createRange();
                range.selectNodeContents(item);
                range.collapse(false);
                const sel = window.getSelection();
                console.log(sel);
                sel.removeAllRanges();
                sel.addRange(range);

                previousText = item.innerText;
            }
        });
    });

    render_code_window(s.pc);
}

function render_code_window(set_addr)
{
    disassembled_window = disassemble(cpu_state, set_addr);
    $("#dbg-code").innerHTML = disassembled_window.join('');
}

function debuggerResponse(data)
{
    switch (data.what) {
        case "stopped":
            debugger_stopped = true;
            cpu_state = data.cpu_state;
            console.log("debugger stopped pc=", Util.hex16(cpu_state.pc), cpu_state);
            show_debugger_line(cpu_state.pc);
            update_debugger_controls();
            refresh_debugger_window(cpu_state);
            break;
    }
}

// collect all breakpoints from all editor sessions
function debugger_collect_breakpoints()
{
    let addrs = [];
    for (let file of Object.keys(sessions)) {
        let s = sessions[file];
        let breakpoints = s.getBreakpoints();
        for (let line in breakpoints) {
            let addr = s.gutter_contents[line].addr;
            addrs.push(addr);
        }
    } 
    for (let addr in debugger_extra_breakpoints) {
        addrs.push(parseInt(addr));
    }

    return addrs;
}

function debugger_set_breakpoints(target)
{
    let addrs = debugger_collect_breakpoints();
    target.postMessage({cmd: "debugger", subcmd: "del-breakpoints", addrs: []}, location.href);
    target.postMessage({cmd: "debugger", subcmd: "set-breakpoints", addrs: addrs}, location.href);
}

function debugger_set_register(regname, value)
{
    let iframe = $("#emulator-iframe");
    let target = iframe ? iframe.contentWindow : null;
    if (!target) return false;

    if (!isNaN(value) && value >= 0 && value <= 0xffff) {
        target.postMessage({cmd: "debugger", subcmd: "set-register", regname: regname, value: value});
        return true;
    }
    return false;
}

function debugger_write_byte(addr, value)
{
    let iframe = $("#emulator-iframe");
    let target = iframe ? iframe.contentWindow : null;
    if (!target) return false;

    if (!isNaN(value) && value >= 0 && value <= 0xff) {
        target.postMessage({cmd: "debugger", subcmd: "write-byte", addr: addr, value: value});
        return true;
    }
    return false;
}

function debugger_target()
{
    let iframe = $("#emulator-iframe");
    return iframe ? iframe.contentWindow : null;
}

function debugger_toggle_breakpoint(addr)
{
    let [file, row] = find_addr_line(addr, true);
    if (file) {
        return session_toggle_breakpoint(sessions[file], row);
    }

    let target = debugger_target();
    if (!target) return;

    // breakpoint outside available source
    if (debugger_extra_breakpoints[addr]) {
        target.postMessage({cmd: "debugger", subcmd: "del-breakpoints", addrs: [addr]});
        delete debugger_extra_breakpoints[addr];
    }
    else {
        debugger_extra_breakpoints[addr] = 1;
        target.postMessage({cmd: "debugger", subcmd: "set-breakpoints", addrs: [addr]});
    }
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

function debugger_show(show)
{
    if (show) {
        $("#debugger-sheet").classList.remove("hidden")
        $("#debugger-controls").classList.remove("hidden")
    }
    else {
        $("#debugger-sheet").classList.add("hidden");
        $("#debugger-controls").classList.add("hidden")
    }
    update_debugger_controls();
}

function debugger_visible()
{
    return !$("#debugger-sheet").classList.contains("hidden");
}
