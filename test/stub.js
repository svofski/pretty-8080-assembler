function importScripts() {}
var self={
	addEventListener: function() {},
};

function atob(a) {
    return new Buffer(a, 'base64').toString('binary');
};