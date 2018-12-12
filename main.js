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
//
// TODO: evaluation should ignore precedence, it's all left-to-right
//

var assembler;//new Assembler();
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
}
var asmcache = new Asmcache();

function updateReferences(ref, tls, labels, org) {
    asmcache.references = ref; // from_line:"text"
    asmcache.textlabels = tls; // line_number:"text"
    asmcache.xref = {};
    asmcache.labels = labels;
    for (var i = 0; i < asmcache.references.length; ++i) {
        var text = asmcache.references[i];
        if (text) {
            if (!asmcache.xref[text]) {
                asmcache.xref[text] = [];
            }
            asmcache.xref[text].push(i);
        }

        text = asmcache.textlabels[i];
        if (text) {
            if (!asmcache.xref[text]) {
                asmcache.xref[text] = [];
            }
            asmcache.xref[text].push(i);
        }
    }

    //for (var key in labels) {
    //    if (labels.hasOwnProperty(key)) {
    //        var value = labels[key];
    //        if (!asmcache.xref[key]) {
    //            asmcache.xref[key] = [];
    //        }
    //        asmcache.xref[key].push(value);
    //    }
    //}

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

// assembler main entry point
function assemble() {
    //var src = document.getElementById('source').innerText;
    var src = editor.session.getLines(0, editor.session.getLength()).join("\n");

    if (last_src === src) {
        return;
    } 

    var list = document.getElementById('list');
    list.savedScroll = list.scrollTop;

    backrefWindow = false;

    if (assemblerWorker) {
        last_src = src;
        assemblerWorker.postMessage({'command': 'assemble', 'src': src});
        if (!listing_listener_added) {
            listing_listener_added = true;
            assemblerWorker.addEventListener('message',
                    function(e) {
                        var listing = e.data['listing'];
                        if (listing) {
                            console.log('assembler worker done');
                            list.innerHTML = '';
                            list.innerHTML += e.data['listing'];
                            var gut = e.data['gutter'] || [];
                            editor.session.gutter_contents = gut;

                            var mrkrs = editor.session.mymarkers || [];
                            for (var i = 0; i < mrkrs.length; ++i) {
                                editor.session.removeMarker(mrkrs[i]);
                            }
                            editor.session.mymarkers = [];
                            
                            for (var i = 0; i < gut.length; ++i) {
                                if (gut[i].error) {
                                    editor.session.mymarkers.push(
                                        editor.session.addMarker(
                                            new Range(i,0,i,1),
                                            "error_marker", "fullLine"));
                                }
                            }

                            editor.resize(true);
                            var references = e.data['references'];
                            var textlabels = e.data['textlabels'];
                            var labels = e.data['labels'];
                            var org = e.data['org'];
                            updateReferences(references, textlabels, labels, org);
                            list.scrollTop = list.savedScroll;//savedScroll;
                            updateSizes();
                            autotranslate = false;
                        }
                    });
        }
    } else if (assembler) {
        assembler.assemble(src);
        list.innerHTML += assembler.listingText;

        list.scrollTop = list.savedScroll;
        updateSizes();
        last_src = src;
        autotranslate = false;
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

function scrollMark(location) {
    scrollHistory[scrollHistory.length] = location;
    if (scrollHistory.length > 32) {
        scrollHistory = scrollHistory.slice(1);
    }
}

// gobak i sosak
function scrollBack() {
    if (scrollHistory.length === 0) return;

    var dest = scrollHistory[scrollHistory.length - 1];
    scrollHistory.length = scrollHistory.length - 1;

    var l = document.getElementById('list');
    l.scrollTop = dest;

    magicToolbar(0);
}

// -- Highlighting and navigation --

var highlightTimeout = false;
var highlightTimeout2 = false;
var highlightLabel = false;
var highlightLineNo = false;
var highlightLines = [];
var highlightArrow = false;
var highlightOrigin = false;
var highlightDir = false;
var highlightDelayed = false;

// backreferences window
var backrefTimeout = false;
var backrefWindow = false;
var backrefTop = 0, backrefLeft = 0;
var backrefLabel = "?";

var referencingLinesFull = [];

function startHighlighting(lineno, label) {
    if (highlightTimeout === false) {
        highlightLineNo = lineno;
        highlightOrigin = document.getElementById('code'+lineno);
        highlightTimeout = setTimeout(function() { highlightStage1(); }, 500);
        if (label !== undefined) {
            highlightLabel = label;
        } else {
            highlightLabel = false;
        }
    }
}

function xscrollTo(n, dontdelay) {
    if (!dontdelay) {
        highlightDelayed = true;
    }
    var l = document.getElementById('list');
    scrollMark(l.scrollTop);

    l.scrollTop = n;

    if (highlightOrigin) {
        highlightOrigin.removeAttribute('onclick');
        highlightOrigin.style.cursor = null;
    }
    if (highlightArrow) {
        highlightOrigin.removeChild(highlightArrow);
    }
}

function highlightStage1() {
    if (!highlightLabel) {
        highlightLabel = getReferencedLabel(highlightLineNo);
    }
    if (highlightLabel) {
        var listElement = document.getElementById('list');
        var scrollTop = listElement.scrollTop;
        var height = getListHeight();

        // highlightLabel would only have relative offsetTop in Opera
        var labelTop = highlightLabel.parentNode.offsetTop;
        var labelHeight = highlightLabel.offsetHeight;

        if (highlightArrow === false && (labelTop-labelHeight) <= scrollTop) {
            highlightArrow = document.createElement('span');
            highlightArrow.innerHTML = '&#x25b2;'; //uarr
            highlightDir = 'uarr';
        } else if (highlightArrow === false && labelTop > scrollTop+height) {
            highlightArrow = document.createElement('span');
            highlightArrow.innerHTML = '&#x25bc;'; //darr
            highlightDir = 'darr';
        }

        if (highlightArrow !== false) {
            highlightArrow.className = highlightDir+1;

            highlightOrigin.insertBefore(highlightArrow, highlightOrigin.firstChild);
            highlightArrow.style.display='inline-block';
            highlightArrow.style.marginLeft ='-4em';
            highlightArrow.style.paddingLeft ='2em';
            highlightArrow.style.width = '2em';

            highlightOrigin.setAttribute('onclick', 
                    'xscrollTo('+(labelTop-height/2)+'); return false;');
            highlightOrigin.style.cursor = 'pointer';
        }

        highlightLabel.className += ' highlight1';
    } 
    highlightTimeout = setTimeout(function() { highlightStage2(); }, 50);
}

function highlightStage2() {
    if (highlightLabel) {
        highlightLabel.className = highlightLabel.className.replace('highlight1', 
                'highlight2');
    }
    if (highlightArrow !== false) {
        highlightArrow.className = highlightDir + 2;
    }
    highlightTimeout = setTimeout(function() { highlightStage3(); }, 100);
}

function highlightStage3() {
    if (highlightLabel) {
        highlightLabel.className = highlightLabel.className.replace('highlight2', 
                'highlight3');
    }
    if (highlightArrow !== false) {
        highlightArrow.className = highlightDir + 3;
    }
}

function endHighlighting(lineno) {
    if (lineno === -2) {
        highlightTimeout2 = setTimeout(function() { endHighlighting(-1); }, 1000);
        highlightStage1();
        return;
    } else if (lineno === -1) {
        highlightDelayed = false;
        highlightTimeout2 = false;
    } else {
        if (highlightDelayed) {
            if (highlightTimeout2 === false) {
                highlightTimeout2 = setTimeout(function() { endHighlighting(-2); }, 350);
            }
            return;
        }
    }

    clearTimeout(highlightTimeout);
    highlightTimeout = false;
    if (highlightLabel) {
        if (highlightLabel.className !== undefined) {
            highlightLabel.className = highlightLabel.className.replace(/ .*/, '');
        }
        highlightLabel = undefined;
    }
    for (var src = 0; src < highlightLines.length; src++) {
        highlightLines[src].className = null;//'srchl0';
    }
    highlightLines.length = 0;

    if (highlightArrow !== false) {
        if (highlightArrow.parentNode !== null) {
            highlightArrow.parentNode.removeChild(highlightArrow);
        }
        highlightArrow = false;
    }
    if (highlightOrigin) {
        highlightOrigin.removeAttribute('onclick');
        highlightOrigin.style.cursor = null;
    }
}

function formatBackrefText(element) {
    formatBackrefText.spaces = "         ";
    var label = "";
    var text = "";
    var adr;
    for (var i = 0; i < element.childNodes.length; i++) {
        var child = element.childNodes[i];
        if (child.id === undefined) continue;
        if (child.id.indexOf("label") === 0) {
            label = child.innerHTML;
        } else if (child.id.indexOf("code") === 0) {
            text = child.innerHTML;
        } else if (child.className === "adr") {
            adr = child.innerHTML;
        }
    }

    if (label.length < formatBackrefText.spaces.length) {
        label += formatBackrefText.spaces.substring(label.length);
    }

    return [adr,label,text].join(' ').replace(/ /g,'&nbsp;');
}

function showBackrefReturn(on) {
    var sosak = document.getElementById('backrefgoback');
    if (sosak !== undefined) {
        sosak.style.display= on ? 'block' : 'none';
    }
    return false;
}

function backrefHintLine(n) {
    if (n === -1) {
        if (backrefHintLine.unhint !== undefined) {
            backrefHintLine.unhint.className = null;
            backrefHintLine.unhint = undefined;
        }
        return;
    }
    backrefHintLine(-1);
    var line = document.getElementById(n);
    if (line !== undefined) {
        backrefHintLine.unhint = line.childNodes[line.childNodes.length-1];
        backrefHintLine.unhint.className = 'srchl3';
    }
}

function startBackrefWindow(lineno) {
    if (lineno != -1) {
        highlightLines = getReferencingLines(lineno);
        highlightOrigin = document.getElementById('code'+lineno);
        backrefLabel = document.getElementById('label'+lineno);
        setTimeout(function() { startBackrefWindow(-1); }, 250);
        return;
    }
    if (backrefTimeout === false &&
            highlightLines.length > 0) {
        backrefTimeout = setTimeout(function() { showBackref(0); }, 500);
        backrefLeft = backrefLabel.offsetLeft;
        backrefTop = highlightOrigin.offsetTop + 4;
        backrefTop += backrefLabel.offsetHeight;
        var list = document.getElementById('list');
        if (!inTheOpera) {
            backrefTop -= document.getElementById('list').scrollTop;
        }
    }
}

function showBackref(n) {
    if (n === 0) {
        endHighlighting(0);
        var list = document.getElementById('list');
        var height = getListHeight();
        backrefTimeout = false;
        // start display
        if (!backrefWindow) {
            backrefWindow = document.createElement('div');
            backrefWindow.id = 'backrefpopup';
            backrefWindow.style.position = 'fixed';
            backrefWindow.setAttribute("onmouseover",
                    "clearTimeout(backrefTimeout);backrefTimeout=false;return false;");
            backrefWindow.setAttribute("onmouseout",
                    "showBackref(-1);return false;");
            document.getElementById('list').appendChild(backrefWindow);
        }
        backrefWindow.style.left = backrefLeft + 'px';
        backrefWindow.style.top = backrefTop + 'px';
        backrefWindow.style.display = 'block';

        backrefWindow.innerHTML = '';
        for (var src = 0; src < referencingLinesFull.length; src++) {
            var labelTop = referencingLinesFull[src].offsetTop;
            var text = formatBackrefText(referencingLinesFull[src]);
            var scrollTo = labelTop - backrefTop + 18;

            backrefWindow.innerHTML += 
                '<div onclick="xscrollTo('+scrollTo+');' +
                'backrefHintLine(\'' + referencingLinesFull[src].id +'\');' +
                'showBackrefReturn(1);' +
                'return false;"' +
                ' class="brmenuitem" ' +
                '>' +
                text + 
                '</div>';
        }
        // append return
        var returnTo = list.scrollTop;
        backrefWindow.innerHTML += 
            '<div id="backrefgoback" onclick="xscrollTo(' +returnTo+ ');'+
            'showBackref(-1);return false;"' +
            ' class="brmenuitem" ' +
            ' style="border-top:1px solid black;font-size:120%;">' +
            '&nbsp;&#x25c0;&nbsp;' + backrefLabel.innerHTML +
            '</div>';
        showBackrefReturn(0);
        backrefWindow.style.opacity = 0;
        showBackref.opacity = 0;
        showBackref(1);
    }

    if (n === 1) {
        if (backrefWindow.style.opacity >= 0.9) {
            backrefTimeout = false;
        } else {
            showBackref.opacity += 0.3;
            backrefWindow.style.opacity = showBackref.opacity;
            setTimeout(function() { showBackref(1); }, 50);
        }
    }

    // start hiding
    if (n === -1) {
        clearTimeout(backrefTimeout);
        backrefTimeout = setTimeout(function() { showBackref(-2); }, 100);
        backrefHintLine(-1);
    }

    if (n === -2) {
        clearTimeout(backrefTimeout);
        backrefTimeout = false;
        if (backrefWindow !== false) {
            backrefWindow.style.display = 'none';
        }
    }

    return false;
}

function mouseover(lineno) {
    startHighlighting(lineno);
    return false;
}

function mouseovel(lineno) {
    startBackrefWindow(lineno);
    return false;
}

function mouseout(lineno) {
    endHighlighting(lineno);
    showBackref(-1);
    return false;
}

function getRuleset(selector) {
    var rules = document.styleSheets[1].cssRules;
    for (var i = 0; i < rules.length; i++) {
        if (rules[i].selectorText === selector) {
            return rules[i];
        }
    }
    return undefined;
}

function rgmouseover(className) {
    var list = [].concat(className);

    for (var i = 0; i < list.length; i++) {
        var ruleset = getRuleset("."+list[i]);
        if (ruleset !== undefined) {
            ruleset.style["color"] = "#ff3020";
        }
    }
}

function rgmouseout(className) {
    var list = [].concat(className);

    for (var i = 0; i < list.length; i++) {
        var ruleset = getRuleset("."+list[i]);
        if (ruleset !== undefined) {
            ruleset.style["color"] = "blue";
        }
    }
}

function boo() {
    //var d = document.createElement('div');
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
            __download(data.slice(start, end), filename,
                "application/octet-stream");
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
                        if (dlmode === "wav" || dlmode === "play") {
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
                        }
                    },
                    false)
        })(asmcache);
    }
    assemblerWorker.postMessage({'command': 'getwav', 'mode': moda});
}

function load_vector06js() {
    if (!binary_listener_added) {
        binary_listener_added = true;
        getmemCallback = function() {
            var emulator_pane = document.getElementById("emulator");
            var container = document.getElementById("emulator-container");
            var iframe = document.createElement("iframe");
            //iframe.src = "../scalar/vector06js?i+";
            iframe.src = "http://sensi.org/scalar/vector06js?i+"; // don't push this to github!
            //iframe.src="https://svofski.github.io/vector06js?i+";
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

function loaded() {
    if (navigator.appName === 'Microsoft Internet Explorer' || 
            navigator.appVersion.indexOf('MSIE') != -1) {
        boo();
        return false;
    }

    i18n();

    if (window) {
        window.onresize = updateSizes;
    }

    updateSizes();

    //var source = document.getElementById("source");
    //if (source) {
    //    source.oninput = keypress;
    //}
    editor.session.on('change', keypress);

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
            load_vector06js();
            run.className += " disabled";
        };
    }

    stop_audio();

    var wavdl = document.getElementById("wav-dl");
    if (wavdl) {
        wavdl.onclick = function() {
            load_play('wav');
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
    "rk": ["Радио-86РК", "hello-rk.asm"],

    "microsha": ["Микроша", "hello-microsha.asm"],

    "apogee": ["Апогей БК-01", "hello-apogee.asm"],

    "partner": ["Партнер 01.01", "hello-partner.asm"],

    "mikro80": ["Микро-80", "hello-micro80.asm"],
    
    "vector06c": ["Вектор-06ц", "hello-v06c.asm"],

    "krista": ["Криста", "hello-krista.asm"],

    "specialist": ["Специалист", "hello-spec.asm"],

    "okean": ["Океан-240 🌊", "hello-okean240.asm"],

    "baboon-dissolve": ["Вектор-06ц: 🐒", "baboon-dissolve.asm"],

    "line-ei": ["Вектор-06ц: быстрая линия", "line-ei.asm"],

    "circle": ["Вектор-06ц: окружность", "circle.asm"],
    
};

function load_ryba(url) 
{
    console.log("Trying to load ", url);

    var oReq = new XMLHttpRequest();
    oReq.open("GET", url, true);
    oReq.responseType = "text";

    oReq.onload = function(oEvent) {
        //console.log(oReq.response);
        let status = oReq.status;
        if (status >= 200 && status < 300 || status === 304) {
            //document.getElementById('source').value = oReq.response;
            editor.setValue(oReq.response, 0);
            editor.clearSelection();
            assemble();
        }
    };
    oReq.onerror = function(oEvent) {
        console.log("XMLHttpRequest error", oEvent);
    };

    oReq.send();
}

function create_ryba_menu()
{
    var menu = document.createElement("div");
    menu.setAttribute("id", "ryba-popup");
    for (var k in rybas) {
        console.log("ryba ", k, rybas[k][0], rybas[k][1]);
        var item = document.createElement("div");
        //item.class = "ryba-item";
        item.setAttribute("class", "ryba-item");
        item.innerText = rybas[k][0];
        (function(href) {
            item.onclick = function() {
                menu.parentElement.removeChild(menu);
                load_ryba(href);
            };
        })(rybas[k][1]);
        menu.onmouseleave = function() {
            menu.parentElement.removeChild(menu);
        };

       menu.appendChild(item);
    }
    
    var text = document.getElementById("source");
    (function(text, menu) {
        text.onclick = function(e) {
            var selectionRange = editor.getSelectionRange();
            selectionRange.start.column -= 2;
            var r1 = editor.session.getTextRange(selectionRange);
            selectionRange.moveBy(0,2);
            var r2 = editor.session.getTextRange(selectionRange);
            
            if (r1 === "🐟" || r2 === "🐟") {
                var parnt = document.getElementById("textinput");
                parnt && parnt.appendChild(menu);

                menu.style.left = (e.clientX - 25) + "px";
                menu.style.top = (e.clientY - 25) + "px";
             }
        };
    })(text, menu);
}

function i18n() {
    var lang = navigator.language;
    if (lang !== undefined) lang = lang.split('-')[0];

    var explang = document.URL.split('?')[1];
    var messages = languages[lang];
    var ryba;
    if (explang) {
        var params = explang.split(',');
        for (var i = 0; i < params.length; ++i) {
            var forcedlang = languages[params[i]];
            if (forcedlang) {
                messages = forcedlang;
            }
            ryba = rybas[params[i]];
        }
    }
    if (explang !== undefined) lang = explang;
    if (!messages) messages = languages["en"];

    if (ryba) {
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
