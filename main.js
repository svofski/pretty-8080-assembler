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

var listing_listener_added = false;
var binary_listener_added = false;
var hex2bin_listener_added = false;
var play_listener_added = false;

var player = undefined;

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

function getListHeight() {
    var listElement = document.getElementById('list');
    return inTheOpera ? 
        listElement.style.pixelHeight : listElement.offsetHeight;

}

function gotoLabel(label) {
    var sought = asmcache.textlabels.indexOf(label.toLowerCase());
    var element = document.getElementById("label" + sought);
    if (element !== undefined) {
        startHighlighting(sought, element);
        element = element.parentNode;
        var destination = element.offsetTop - getListHeight()/2;
        xscrollTo(destination, true);
    }
    return false;
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

// assembler main entry point
function assemble() {
    //var src = editor.session.getLines(0, editor.session.getLength()).join("\n");

    //if (last_src === src) {
    //    return;
    //} 

    if (assemblerWorker) {
        //last_src = src;

        assemblerWorker.postMessage({'command': 'assemble', 'project': project});
        if (!listing_listener_added) {
            listing_listener_added = true;
            assemblerWorker.addEventListener('message',
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
                        updateSizes();
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
                    });
        }
    } else if (assembler) {
        assembler.assemble(src);
        updateSizes();
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
    var data = new Uint8Array(mem.length);
    var start = e.data['org'];
    var end = mem.length;
    for (var i = start, end = data.length; i < end; ++i) {
        data[i] = 0xff & mem[i];
    }

    switch (e.data['download']) {
        case 'bin':
            if (e.data.extra === 'r') {
                run_vector06js(data.slice(start, end), filename);
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
            var stream = new TapeFormat(e.data['tapeFormat'], true).
                format(data.slice(start, end), start, filename);
            __download(stream.data, filename, "application/octet-stream");
            break;
    }
}

/* Downloadable blob */
function load_hex2bin(format) {
    if (!hex2bin_listener_added) {
        hex2bin_listener_added = true;
        assemblerWorker.addEventListener('message', hex2binMessageListener, 
                false);
    }
    assemblerWorker.postMessage({'command': 'get' + format});
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
            assemblerWorker.addEventListener('message',
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
                            run_vector06js(stream, "program.wav");
                        }
                    },
                    false)
        })(asmcache);
    }
    assemblerWorker.postMessage({'command': 'getwav', 'mode': moda});
}

let close_emulator_cb = null;

function run_vector06js(bytes, filename) {
    let emulator_pane = document.getElementById("emulator");
    let container = document.getElementById("emulator-container");
    let iframe = document.createElement("iframe");
    let src_url = location.protocol + "//" + location.hostname + "/vector06js?i+";
    iframe.src = src_url;
    iframe.id = "emulator-iframe";
    container.appendChild(iframe);
    emulator_pane.className += " visible";

    close_emulator_cb = () => {
        container.removeChild(iframe);
        emulator_pane.className = 
            emulator_pane.className.replace(/ visible/g, "");
        blinkCount = 16;
        close_emulator_cb = null;
        editor.focus();
        closedEmulator();
    };

    emulator_pane.onclick = function() {
        close_emulator_cb && close_emulator_cb();
    };

    let listener = (e) => {
        if (e.data.type === "ready" && iframe && iframe.contentWindow) {
            const file = new File([bytes], filename, { type: "application/octet-stream" });
            iframe.contentWindow.postMessage({cmd: "loadfile", file}, "https://caglrc.cc");

            //window.removeEventListener("message", listener);
        }
        if (e.data.type === "tape_stopped") {
            enableBobinage(false);
        }
    };

    window.addEventListener("message", listener);

    iframe.onload = function() {
        iframe.contentWindow.focus();
        iframe.contentDocument.addEventListener("keydown", (e) => {
            if (testHotKey(e, "launch-emulator")) {
                close_emulator_cb && close_emulator_cb();
            }
        });
    };
}

// old version
function load_vector06js() {
    if (!binary_listener_added) {
        binary_listener_added = true;
        getmemCallback = function() {
            var emulator_pane = document.getElementById("emulator");
            var container = document.getElementById("emulator-container");
            var iframe = document.createElement("iframe");
            let src_url = location.protocol + "//" + location.hostname + "/vector06js?i+";
            iframe.src = src_url;
            iframe.id = "emulator-iframe";
            container.appendChild(iframe);
            emulator_pane.className += " visible";
            emulator_pane.onclick = function() {
                container.removeChild(iframe);
                emulator_pane.className = 
                    emulator_pane.className.replace(/ visible/g, "");
                var run = document.getElementById("run");
                run.className = run.className.replace(/ disabled/g, "");
                blinkCount = 16;
            };

            iframe.onload = function() {
                iframe.contentWindow.focus();
                if (emulator_sideload) {
                    emulator_sideload({'name':asmcache.binFileName, 
                        'mem':asmcache.mem});
                }
            };
        };
        assemblerWorker.addEventListener('message', binaryMessageListener, false);
    }
    assemblerWorker.postMessage({'command': 'getmem'});
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

function runEmulator()
{
    var run = document.getElementById("run");
    load_hex2bin('bin,r');
    run.className += " disabled";
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

function loaded() {
    if (navigator.appName === 'Microsoft Internet Explorer' || 
            navigator.appVersion.indexOf('MSIE') != -1) {
        boo();
        return false;
    }

    i18n();

    if (window) {
        window.onresize = updateSizes;
        window.onbeforeunload = function() {
            autosave();
        }
    }

    autoload();

    updateSizes();

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
            if (run_button) {
                if (close_emulator_cb) {
                    close_emulator_cb();
                }
                else {
                    runEmulator();
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

    cock(100);
}

function updateSizes() {
    var header_height = document.getElementById('header').clientHeight;
    var bottom_height = document.getElementById('buttons-below').clientHeight;
    var height = window.innerHeight - header_height - bottom_height - 10;

    var ti = document.getElementById('source');
    ti.style.height = height + "px";
    var to = document.getElementById('list');
    to.style.height = height + "px";

    editor.resize(true);
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
    "welcome": ["Главрыба", "test.asm", "test-res.inc"],
    
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
    newProject(ask, "test.asm", "");
    //load_ryba("?welcome");
    let glavryba = rybas["welcome"]
    let extrafiles = glavryba.slice(2);
    load_ryba(glavryba[1], extrafiles);
    editor.clearSelection();
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

function i18n() {
    var lang = navigator.language;
    if (lang !== undefined) lang = lang.split('-')[0];

    var explang = document.URL.split('?')[1];
    var messages = languages[lang];
    var ryba;
    var extryba;
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
    if (explang !== undefined) lang = explang;
    if (!messages) messages = languages["en"];

    if (extryba) {
        load_ryba(extryba);
    }
    else if (ryba) {
        load_ryba(document.URL.split('?')[0] + ryba[1]);
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
        document.getElementById('list').style.cssFloat = 'left';
    }

    create_ryba_menu();
}
