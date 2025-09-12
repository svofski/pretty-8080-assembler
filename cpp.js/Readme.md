cpp.js
========

#### C Preprocessor in Javascript ####

cpp.js is a tiny implementation of the C preprocessor (cpp) in Javascript (js).

It supports all features of the original, including `#include`'s and the
stringization (`#`) and token concatenation (`##`) operators. Macro substitution
is performed (almost) in accordance with the C99 specification. See the 
*Conformance* section for more information.

My pet project medea.js uses this code to preprocess GLSL shaders, other use
cases might even exist. 

### Releases ###

You can find both normal and minified release builds in the [download tab](https://github.com/acgessler/cpp.js/downloads).

 - __1.0__ (2011-01-28) Initial release. 

### License ###

Modified BSD license, see the LICENSE file for the full text. Means 
basically you can do everything with it, except claim you wrote it
and a copy of the license should always be distributed (a backlink
to this page is also fine).

### Usage ###

(This sample is effectively the entire external documentation, feel free to contribute further contents).

```javascript

// Setup basic settings for the preprocessor. The values as shown below
// are the default values and can be omitted.
var settings = { 

   // signal string that starts a preprocessor command, 
   // only honoured at the beginning of a line.
   signal_char : '#',

   // function used to print warnings, the default 
   // implementation logs to the console.
   warn_func : null,

   // function used to print critical errors, the default 
   // implementation logs to the console and throws.
   error_func : null,
   
   // function to be invoked to fetch include files.
   // See the section "Handling include files" below.
   include_func : null,
   
   // function used to strip comments from the input file.
   // The default implementation handles C and C++-style
   // comments and also removes line continuations.
   // Since this function is invoked on all files before
   // any preprocessing happens, it can be thought of as a 
   // "preprocessor to the preprocessor".
   comment_stripper : null
}

// Create an instance of the library. `settings` is optional.
var pp = cpp_js( settings );

// Predefine some symbols, the same effect could be reached
// by prepending the corresponding #define's to the source
// code for preprocessing but this is way nicer.
// cpp.js by itself does not predefine any symbols.
var predefined = {
   DEBUG : '',               // equivalent to `#define DEBUG`
   ANOTHER_DEFINE : '248935' // equivalent to `#define ANOTHER_DEFINE 248935`
};

pp.define_multiple(predefined);

pp.define("macro_with_args(a,b)","a ## b");

pp.undef('DEBUG');
pp.defined('DEBUG'); // => false

// Now invoke the preprocesser on the given text block.
// The processor keeps the state obtained from executing the text 
// block. Therefore, if run() is invoked on multiple text blocks, any
// defines from a block will also apply to its successors.

// However, a text block is assumed to be syntactically complete 
// i.e. all conditional blocks and also all comments must be closed
// and may not leap into the next block.
var preprocessed_source = pp.run(text);

// Calling clear() resets all defined values. The effect is the same as if
// a fresh cpp.js instance with same settings was created.
pp.clear();

```

### node.js ###

cpp.js also works as a node.js module:


```javascript

var cpp = require("./cpp");
var pp = cpp.create( settings );

// ...
// same as above

```

### Handling #include files ###

By default, include directives cause errors. To enable `#include`-support, one
must specify an `include_func` in the initial settings. This function receives
the name of the include file that is requested and a closure to resume
preprocessing as soon as the file is available (the mechanism is thus 
compatible with asynchronous file reading, i.e. via AJAX or node.js).

**If include files are enabled, cpp.js becomes strictly asynchronous** and
`run()` always returns null. Therefore it is also necessary to specify an
`completion_func` callback in the settings, which is invoked as soon as 
preprocessing is complete, receiving the preprocessed text as parameter.

Specifying an `include_func` but no `completion_func` is not allowed.

The basic structure for this scenario is like this:

```javascript

settings.include_func = function(file, is_global, resumer, error) {

	// `is_global` is `true` if the file name was enclosed
	// in < .. > rather than " .. ".

    do_fancy_magic_to_fetch_this_file(file, function(contents) {
		// call resumer(null) if the file is not accessible
	   resumer(contents);
	});
};

settings.completion_func = function(preprocessed_text) {
    // process result
};
```

### Conformance ###

cpp.js was written with the C99 language standard in mind and conforms in most
aspects. However, its expression evaluation engine is based on `eval`, whose
arithmetics are not strictly C-compliant (i.e. underflow/overflow).

`#` is evaluated regardless whether the next token is a substituted macro
argument or not.

It is also important to note that cpp.js does not tokenize the input stream
into preprocessing tokens (it works on the plain text input instead). The 
output should in almost all cases be correct, though, so this is no matter
for most use cases. However, this design decision made proper handling of 
placeholder preprocessing tokens tricky and there are surely bugs in this
part.

Error messages are mostly taken directly from `gnu cpp`.

Not supported are:
  
 - variadic argument lists
 - character constants in arithmetics
 - predefined macro names from C (i.e. `__FILE__`)
 - `#line`




