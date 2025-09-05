var Range = ace.require('ace/range').Range;

//editor.setKeyboardHandler('ace/keyboard/vim');

var Tooltip = ace.require("ace/tooltip").Tooltip;
var oop = ace.require("ace/lib/oop");
var Event = ace.require("ace/lib/event");
function TokenTooltip(editor) {
    if (editor.tokenTooltip) {
        return;
    }

    Tooltip.call(this, editor.container);
    editor.tokenTooltip = this;
    this.editor = editor;

    this.update = this.update.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseOut = this.onMouseOut.bind(this);
    Event.addListener(editor.renderer.scroller, "mousemove", this.onMouseMove);
    Event.addListener(editor.renderer.content, "mouseout", this.onMouseOut);
}
oop.inherits(TokenTooltip, Tooltip);

(function() {
    this.token = {};
    this.range = new Range();
    this.update = function() {
        this.$timer = null;

        var r = this.editor.renderer;
        if (this.lastT - (r.timeStamp || 0) > 1000) {
            r.rect = null;
            r.timeStamp = this.lastT;
            this.maxHeight = window.innerHeight;
            this.maxWidth = window.innerWidth;
        }


        var canvasPos = r.rect || (r.rect = r.scroller.getBoundingClientRect());
        var offset = (this.x + r.scrollLeft - canvasPos.left - r.$padding) / r.characterWidth;
        var row = Math.floor((this.y + r.scrollTop - canvasPos.top) / r.lineHeight);
        var col = Math.round(offset);

        //console.log("tt canvaspos row col", canvasPos, row, col);

        var screenPos = {row: row, column: col, side: offset - col > 0 ? 1 : -1};
        var session = this.editor.session;
        var docPos = session.screenToDocumentPosition(screenPos.row, screenPos.column);
        var token = session.getTokenAt(docPos.row, docPos.column);

        if (!token && !session.getLine(docPos.row)) {
            token = {
                type: "",
                value: "",
                state: session.bgTokenizer.getState(0)
            };
        }
        if (!token) {
            session.removeMarker(this.marker);
            this.hide();
            return;
        }

        var tokenText = token.value.replace(/[:\s]/g, '');
        var addr = asmcache.labels[tokenText.toLowerCase()];
        var ref = "";
        var label = tokenText;    
        if (addr) {
            ref = label + "=0x" + Util.hex16(addr);
        }
        tokenText = ref.trim();

        if (tokenText.length > 0) {
            if (this.tokenText != tokenText) {
                this.clearxrefs();
                var textobj = {text: []};
                this.xrefs = this.collectXrefs(label, textobj);
                if (token.start == 0) {
                    tokenText = "";
                } else {
                    tokenText += '\n';
                }
                if (textobj.text.length) {
                    tokenText += textobj.text.join('\n');
                }
                this.setText(tokenText);
                this.width = this.getWidth();
                this.height = this.getHeight();
                this.tokenText = tokenText;
            }

            if (tokenText.length) {
                this.show(null, this.x, this.y);
            }

            this.token = token;
            session.removeMarker(this.marker);
            this.range = new Range(docPos.row, token.start, docPos.row, token.start + token.value.length);
            //this.marker = session.addMarker(this.range, "ace_bracket", "text");
        }
        else {
            this.disappear();
        }
    };

    this.clearxrefs = function()
    {
        if (!this.xrefs) return;
        for (var i = 0; i < this.xrefs.length; ++i) {
            this.editor.session.removeMarker(this.xrefs[i]);
        }
    }

    this.disappear = function() {
        this.hide();
        this.editor.session.removeMarker(this.marker);
        this.clearxrefs();
        this.$timer = clearTimeout(this.$timer);
        this.tokenText = undefined;
    }

    this.collectXrefs = function(label, textobj) {
        var result = [];

        label = label.toLowerCase();
        var xfiles = asmcache.xref_by_file[label];

        for (let file in xfiles) {
            let xrefs = xfiles[file];
            let s = sessions[file];

            if (!s || !xrefs) continue;

            for (var k = 0; xrefs && k < xrefs.length; ++k) { 
                var i = xrefs[k];
                var text = s.getLine(i);

                var precomment = [
                    Util.hex16(s.gutter_contents[i].addr) + " " + 
                    text.slice(0,80)];
                if (text.toLowerCase().match('^\s*' + label + '\\b')) {
                    for (var cmt = i - 1; cmt >= 0; --cmt) {
                        var t = s.getLine(cmt);
                        if (t && t.match(/^\s*;/)) {
                            precomment.push(t);
                        } 
                        else break;
                    }
                }

                textobj.text.push(precomment.reverse().join('\n'));

                var re = new RegExp('\\b' + label + '\\b', 'gi');
                for (var m = re.exec(text); m; m = re.exec(text)) {
                    var range = new Range(i, m.index, i, m.index + label.length);
                    result.push(s.addMarker(range, "ace_xref", "text"));
                }
            }
        }

        return result;
    };

    this.onMouseMove = function(e) {
        this.x = e.clientX;
        this.y = e.clientY;
        if (this.isOpen) {
            this.lastT = e.timeStamp;
            this.setPosition(this.x, this.y);
        }
        if (!this.$timer)
            this.$timer = setTimeout(this.update, 100);
    };

    this.onMouseOut = function(e) {
        if (e && e.currentTarget.contains(e.relatedTarget))
            return;
        this.disappear();
    };

    this.setPosition = function(x, y) {
        if (x + 10 + this.width > this.maxWidth)
            x = window.innerWidth - this.width - 10;
        if (y > window.innerHeight * 0.75 || y + 20 + this.height > this.maxHeight)
            y = y - this.height - 30;

        Tooltip.prototype.setPosition.call(this, x + 10, y + 20);
    };

    this.destroy = function() {
        this.onMouseOut();
        Event.removeListener(this.editor.renderer.scroller, "mousemove", this.onMouseMove);
        Event.removeListener(this.editor.renderer.content, "mouseout", this.onMouseOut);
        delete this.editor.tokenTooltip;
    };
}).call(TokenTooltip.prototype);


function GutnikBox(editor) {
    this.editor = editor;
    console.log("GutnikBox: this=", this);

    this.beginShowing = this.beginShowing.bind(this);
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
    this.timer = null;

    editor.on('guttermousemove', this.beginShowing);
    editor.on('mousemove', this.hide);
}

// gutter popup
(function() {
    this.beginShowing = function(e) {
        var row = e.getDocumentPosition().row;
        var gutnik = editor.session.gutter_contents[row];

        if (this.timer !== null && this.row !== row) {
            this.hide();
        }

        if (gutnik && gutnik.hex.length > 4) {
            if (this.timer == null) {
                this.where = editor.renderer.textToScreenCoordinates(e.getDocumentPosition());
                this.row = row;
                this.timer = setTimeout(this.show, 100);
            }
        } 
        else {
            this.hide();
        }
    };

    this.show = function(e) {
        //console.log("Showing gutnik at ", this.where);
        var gt = document.createElement('div');

        var cnt = editor.session.gutter_contents[this.row];
        gt.innerHTML = '<pre class="gutter-pre">'+
            Util.formatGutterFull(cnt.addr, cnt.hex)+'</pre>';
        gt.classList.add('gutter-box');
        gt.style.top = this.where.pageY + "px";
        gt.style.left = (this.where.pageX - editor.renderer.gutterWidth) + "px";
        document.body.appendChild(gt);

        gt.addEventListener('mouseleave', this.hide);

        this.gutterbox = gt;

        this.timer = setTimeout(this.hide, 10000);
    }

    this.hide = function(e) {
        if (this.gutterbox) {
            document.body.removeChild(this.gutterbox);
            this.gutterbox = null;
        }
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

}).call(GutnikBox.prototype);


function createAceSession(text)
{
    let session = ace.createEditSession(text, "ace/mode/assembly_8080");
    session.setOptions({
        mode: "ace/mode/assembly_8080",
        tabSize: 8,
        useSoftTabs: true,
        wrap: true,
    });
    session.gutter_contents = [];
    session.gutterRenderer =  {
        getWidth: function(session, lastLineNumber, config) {
            return 20 * config.characterWidth;
            return lastLineNumber.toString().length * config.characterWidth;
        },
        getText: function(session, row) {
            var gc = session.gutter_contents[row];
            if (gc) return Util.formatGutterBrief(gc.addr,gc.hex) || "*";
            return "*";//String.fromCharCode(row + 65);
        }
    };

    return session;
}

function AceHook() {
    editor = ace.edit("source");
    editor.setTheme("ace/theme/twilight");

    default_ryba = editor.getValue();
    //editor.session.setOptions({
    //    mode: "ace/mode/assembly_8080",
    //    tabSize: 8,
    //    useSoftTabs: true,
    //    wrap: true,
    //});
    //decorateAceSession(editor.session);
    //editor.session.gutter_contents = [];
    //editor.session.gutterRenderer =  {
    //    getWidth: function(session, lastLineNumber, config) {
    //        return 20 * config.characterWidth;
    //        return lastLineNumber.toString().length * config.characterWidth;
    //    },
    //    getText: function(session, row) {
    //        var gc = session.gutter_contents[row];
    //        if (gc) return Util.formatGutterBrief(gc.addr,gc.hex) || "*";
    //        return "*";//String.fromCharCode(row + 65);
    //    }
    //};

    new TokenTooltip(editor);


    new GutnikBox(editor);
}

