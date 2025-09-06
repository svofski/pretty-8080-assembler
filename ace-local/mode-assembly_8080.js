ace.define("ace/mode/assembly_8080_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var AssemblyX86HighlightRules = function() {
    this.instr = 
	'\\b(nop|hlt|ei|di|sphl|xchg|xthl|daa|cma|stc|cmc|rlc|rrc|ral|rar|pchl|ret'
           +'|lda|sta|lhld|shld|jmp|call'
           +'|lxi|adi|aci|sui|sbi|ani|xri|ori|cpi|in|out|mvi|mov'
           +'|add|adc|sub|sbb|ana|xra|ora|cmp|inr|dcr'
           +'|ldax|stax|dad|inx|dcx|push|pop'
           +'|c(?:mp|nz|z|nc|c|po|pe|p|m)'
           +'|r(?:mp|nz|z|nc|c|po|pe|p|m)'
           +'|j(?:mp|nz|z|nc|c|po|pe|p|m))\\b';
    this.reg = '\\b(a|b|c|d|e|h|l|sp|psw|m)\\b';
    this.expr = '([a-zA-Z_+-<>]+)\\b';
    this.$rules = {
        start:
        [ 
            {
                token: 'keyword.control.assembly',
                regex: this.instr,
                next: 'args',
                caseInsensitive: true,
            },
            {
                token: 'support.function.directive.assembly',
                regex: '\\b(org|equ|project|tape|encoding|cpu|db|dw|ds|db64)\\b',
                caseInsensitive: true,
                next: 'args',
            },
            { token: ['comment.assembly', 'fish', 'comment.assembly'], regex: /(;.*?)(🐟)(.*)/ },
            { token: 'comment.assembly', regex: ';.*'},

            { token: 'entity.name.function.assembly',
              regex: '[_a-zA-Z][_a-zA-Z0-9]+(\:?)'},
        ],
        args:
        [
            {
                token: 'text',
                regex: '(\\\\|$|^)',
                next: 'start',
            },
            {
                token: 'variable.parameter.register.assembly',
                regex: this.reg
            },
            { token: 'constant.character.hexadecimal.assembly',
                regex: '\\b0x[A-F0-9]+\\b',
                caseInsensitive: true },
            { token: 'constant.character.hexadecimal.assembly',
                regex: '\\b[A-F0-9]+h\\b',
                caseInsensitive: true },
            { token: 'constant.character.hexadecimal.assembly',
                regex: '\\$[A-F0-9]+\\b', // $ seems to conflict with word boundary
                caseInsensitive: true },
            { token: 'constant.character.octal.assembly',
                regex: '\\b[0-7]+q\\b',
                caseInsensitive: true },
            { token: 'constant.character.binary.assembly',
                regex: '\\b[01]+b\\b',
                caseInsensitive: true },
            { token: 'constant.character.decimal.assembly',
                regex: '\\b[0-9]+\\b' },
            //
            { token: 'string.assembly', regex: /'([^\\']|\\.)*'/ },
            { token: 'string.assembly', regex: /"([^\\"]|\\.)*"/ },
            //
            { token: 'entity.name.function.assembly',
              regex: '[_a-zA-Z][_a-zA-Z0-9]+(\:?)'},
            { token: 'comment.assembly', regex: ';.*$', next: 'start' } 
        ]
    };
   
    this.normalizeRules();
};

AssemblyX86HighlightRules.metaData = { fileTypes: [ 'asm' ],
      name: 'Assembly x86',
      scopeName: 'source.assembly' };


oop.inherits(AssemblyX86HighlightRules, TextHighlightRules);

exports.AssemblyX86HighlightRules = AssemblyX86HighlightRules;
});

ace.define("ace/mode/folding/coffee",["require","exports","module","ace/lib/oop","ace/mode/folding/fold_mode","ace/range"], function(require, exports, module) {
"use strict";

var oop = require("../../lib/oop");
var BaseFoldMode = require("./fold_mode").FoldMode;
var Range = require("../../range").Range;

var FoldMode = exports.FoldMode = function() {};
oop.inherits(FoldMode, BaseFoldMode);

(function() {

    this.getFoldWidgetRange = function(session, foldStyle, row) {
        var range = this.indentationBlock(session, row);
        if (range)
            return range;

        var re = /\S/;
        var line = session.getLine(row);
        var startLevel = line.search(re);
        if (startLevel == -1 || line[startLevel] != "#")
            return;

        var startColumn = line.length;
        var maxRow = session.getLength();
        var startRow = row;
        var endRow = row;

        while (++row < maxRow) {
            line = session.getLine(row);
            var level = line.search(re);

            if (level == -1)
                continue;

            if (line[level] != "#")
                break;

            endRow = row;
        }

        if (endRow > startRow) {
            var endColumn = session.getLine(endRow).length;
            return new Range(startRow, startColumn, endRow, endColumn);
        }
    };
    this.getFoldWidget = function(session, foldStyle, row) {
        var line = session.getLine(row);
        var indent = line.search(/\S/);
        var next = session.getLine(row + 1);
        var prev = session.getLine(row - 1);
        var prevIndent = prev.search(/\S/);
        var nextIndent = next.search(/\S/);

        if (indent == -1) {
            session.foldWidgets[row - 1] = prevIndent!= -1 && prevIndent < nextIndent ? "start" : "";
            return "";
        }
        if (prevIndent == -1) {
            if (indent == nextIndent && line[indent] == "#" && next[indent] == "#") {
                session.foldWidgets[row - 1] = "";
                session.foldWidgets[row + 1] = "";
                return "start";
            }
        } else if (prevIndent == indent && line[indent] == "#" && prev[indent] == "#") {
            if (session.getLine(row - 2).search(/\S/) == -1) {
                session.foldWidgets[row - 1] = "start";
                session.foldWidgets[row + 1] = "";
                return "";
            }
        }

        if (prevIndent!= -1 && prevIndent < indent)
            session.foldWidgets[row - 1] = "start";
        else
            session.foldWidgets[row - 1] = "";

        if (indent < nextIndent)
            return "start";
        else
            return "";
    };

}).call(FoldMode.prototype);

});

ace.define("ace/mode/assembly_8080",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/assembly_8080_highlight_rules","ace/mode/folding/coffee"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var AssemblyX86HighlightRules = require("./assembly_8080_highlight_rules").AssemblyX86HighlightRules;
var FoldMode = require("./folding/coffee").FoldMode;

var Mode = function() {
    this.HighlightRules = AssemblyX86HighlightRules;
    this.foldingRules = new FoldMode();
    this.$behaviour = this.$defaultBehaviour;
};
oop.inherits(Mode, TextMode);

(function() {
    this.lineCommentStart = [";"];
    this.$id = "ace/mode/assembly_8080";
}).call(Mode.prototype);

exports.Mode = Mode;
});                (function() {
                    ace.require(["ace/mode/assembly_8080"], function(m) {
                        if (typeof module == "object" && typeof exports == "object" && module) {
                            module.exports = m;
                        }
                    });
                })();
            
