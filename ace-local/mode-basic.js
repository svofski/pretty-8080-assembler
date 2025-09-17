ace.define("ace/mode/basic",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/basic_highlight_rules","ace/mode/folding/coffee"], function(require, exports, module) {
"use strict";

    var oop = require("../lib/oop");
    var TextMode = require("./text").Mode;

    function myTokenizer(line) {
        let tokens = [];
        let regex = /(\s+|[A-Za-z][A-Za-z0-9$%!#]*|\d+|.)/g;
        let match;
        while ((match = regex.exec(line))) {
            let text = match[0];

            if (/^\s+$/.test(text)) {
                tokens.push({ type: "text", value: text });   // keep spaces
            } else if (/^\d+$/.test(text)) {
                tokens.push({ type: "constant.numeric", value: text });
            } else if (/^[A-Za-z]/.test(text)) {
                tokens.push({ type: "identifier", value: text });
            } else {
                tokens.push({ type: "punctuation", value: text });
            }
        }
        return tokens;
    }

    var Mode = function() {
        this.$tokenizer = {
            getLineTokens: function(line, state) {
                // call your own tokenizer here
                const toks = myTokenizer(line); 
                // must return objects { type: "token.type", value: "actualText" }
                return {
                    tokens: toks,
                    state: state
                };
            }
        };
    };
    oop.inherits(Mode, TextMode);

    (function() {
        this.lineCommentStart = [";"];
        this.$id = "ace/mode/basic";
    }).call(Mode.prototype);

    exports.Mode = Mode;
});


