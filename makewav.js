/* Thanks to asanoboy https://gist.github.com/asanoboy/3979747 */

var Wav = function(opt_params){

    /**
     * @private
     */
    this._sampleRate = opt_params && opt_params.sampleRate ? opt_params.sampleRate : 44100;

    /**
     * @private
     */
    this._channels = opt_params && opt_params.channels ? opt_params.channels : 2;  

    /**
     * @private
     */
    this._eof = true;

    /**
     * @private
     */
    this._bufferNeedle = 0;

    /**
     * @private
     */
    this._buffer;

};

Wav.prototype.setBuffer = function(buffer){
    this._buffer = this.getWavUint8Array(buffer);
    this._bufferNeedle = 0;
    this._internalBuffer = '';
    this._hasOutputHeader = false;
    this._eof = false;
};

Wav.prototype.getBuffer = function(len){
    var rt;
    if( this._bufferNeedle + len >= this._buffer.length ){
        rt = new Uint8Array(this._buffer.length - this._bufferNeedle);
        this._eof = true;
    }
    else {
        rt = new Uint8Array(len);
    }

    for(var i=0; i<rt.length; i++){
        rt[i] = this._buffer[i+this._bufferNeedle];
    }
    this._bufferNeedle += rt.length;

    return  rt.buffer;
};

Wav.prototype.eof = function(){
    return this._eof;
};

const WAV_HEADER_SIZE = 22;

Wav.prototype.getWavUint8Array = function(buffer){
    var intBuffer = new Int16Array(WAV_HEADER_SIZE);
    var byteBuffer = new Uint8Array(buffer.length + WAV_HEADER_SIZE * 2);

    intBuffer[0] = 0x4952; // "RI"
    intBuffer[1] = 0x4646; // "FF"

    intBuffer[2] = (buffer.length + WAV_HEADER_SIZE - 8) & 0x0000ffff; // RIFF size
    intBuffer[3] = ((buffer.length + WAV_HEADER_SIZE - 8) & 0xffff0000) >> 16; // RIFF size

    intBuffer[4] = 0x4157; // "WA"
    intBuffer[5] = 0x4556; // "VE"

    intBuffer[6] = 0x6d66; // "fm"
    intBuffer[7] = 0x2074; // "t "

    intBuffer[8] = 0x0010; // fmt chunksize: 16
    intBuffer[9] = 0x0000; //

    intBuffer[10] = 0x0001; // format tag : 1 
    intBuffer[11] = this._channels; // channels: 1

    intBuffer[12] = this._sampleRate & 0x0000ffff; // sample per sec
    intBuffer[13] = (this._sampleRate & 0xffff0000) >> 16; // sample per sec

    intBuffer[14] = (this._channels*this._sampleRate) & 0x0000ffff; // byte per sec
    intBuffer[15] = ((this._channels*this._sampleRate) & 0xffff0000) >> 16; // byte per sec

    intBuffer[16] = 0x0001; // block align
    intBuffer[17] = 0x0008; // bit per sample
    intBuffer[18] = 0x6164; // "da"
    intBuffer[19] = 0x6174; // "ta"
    intBuffer[20] = (buffer.length) & 0x0000ffff; // data size[byte]
    intBuffer[21] = ((buffer.length) & 0xffff0000) >> 16; // data size[byte]	

    /* Copy header */
    var dptr = 0;
    for (var i = 0; i < WAV_HEADER_SIZE; ++i) {
        byteBuffer[dptr++] = 0377 & intBuffer[i];
        byteBuffer[dptr++] = intBuffer[i] >> 8;
    }

    var sptr = 0;
    for (var i = 0; i < buffer.length; i++) {
        byteBuffer[dptr++] = buffer[i];
    }

    return byteBuffer;
};
