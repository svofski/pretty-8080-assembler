var fs = require('fs');
var pp = require('path');

//var header='<html><head>'+
//    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>'+
//    '<link href="list-test.css" rel="stylesheet" type="text/css" media="screen"/>'+
//    '<link href="../list-test.css" rel="stylesheet" type="text/css" media="screen"/>'+
//    '</head><body>';
//var footer='</body></html>';

var header='';
var footer='';

function process_asm(filename, outfilename)
{
    var src = fs.readFileSync(filename);
    var listobj = {};
    asm.assemble(src.toString('utf8'), listobj);
    fs.writeFileSync(outfilename, Buffer.from(header + listobj.text + footer));
}

if (asm) {
    console.log('assembler found, pas mal');
    asm.doHexDump = true;
}

for (var i = 2; i < process.argv.length; ++i) {
    var ass = process.argv[i];
    var basename = pp.basename(ass, '.asm');
    var lst = 'out/' + basename + '.lst';
    process_asm(ass, lst);
}
