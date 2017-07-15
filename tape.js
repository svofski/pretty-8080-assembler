/* Tape stuff */

function TapeFormat(fmt) {
    this.format = null;
    switch (fmt) {
        case 'rk-bin':
            this.format = TapeFormat.prototype.nekrosha;
            break;
        case 'v06c-rom':
            this.format = TapeFormat.prototype.v06crom;
            break;
    }
    return this;
}

TapeFormat.prototype.rk = function(mem, org, name) {
};

TapeFormat.prototype.v06crom = function(mem, org, name) {
};

function Outil() {}

Outil.hex8 = function(val) {
    if (val < 0 || val > 255)  return "??";

    var hexstr = "0123456789ABCDEF";
    return hexstr[(val & 0xf0) >> 4] + hexstr[val & 0x0f];
};

Outil.hex16 = function(val) {
    return Outil.hex8((val & 0xff00) >> 8) + Outil.hex8(val & 0x00ff);
};



/* 
 * Элемент  Размер, байт 
 * Ракорд (нулевые байты)   256 
 * Синхробайт (E6h)         1 
 * Начальный адрес в ОЗУ    2 
 * Конечный адрес в ОЗУ     2 
 * Данные   (конечный адрес - начальный адрес + 1) 
 * Ракорд (нулевые байты)   2 
 * Синхробайт (E6h)         1 
 * Контрольная сумма        2 
 * 0 0 0 0 0 svo: pad with some zeroes in the end
 */
TapeFormat.prototype.nekrosha = function(mem, org, name) {
    var data = new Uint8Array(mem.length + 266 + 5);

    var cs_hi = 0;
    var cs_lo = 0;

    var dptr = 0;
    for (var i = 0; i < 256; ++i) {
        data[dptr++] = 0;
    }

    data[dptr++] = 0xe6;
    data[dptr++] = (org >> 8) & 0377;
    data[dptr++] = org & 0377;
    data[dptr++] = ((org + mem.length - 1) >> 8) & 0377;
    data[dptr++] = (org + mem.length - 1) & 0377;

    for (var i = 0; i < mem.length; ++i) {
        let octet = mem[i];
        data[dptr++] = octet;
        cs_lo += octet;
        if (i < mem.length - 1) {
            cs_hi += octet + ((cs_lo >> 8) & 0377);
        }
        cs_lo &= 0377;
    }

    console.log('checksum=', Outil.hex8(cs_hi&0377), Outil.hex8(cs_lo&0377));

    //cs_hi = 0x12;
    //cs_lo = 0x34;

    data[dptr++] = 0;
    data[dptr++] = 0;
    data[dptr++] = 0xe6;
    data[dptr++] = cs_hi & 0377;
    data[dptr++] = cs_lo & 0377;

    data[dptr++] = 0;
    data[dptr++] = 0;
    data[dptr++] = 0;
    data[dptr++] = 0;
    data[dptr++] = 0;

    //return data;
    var encoded = TapeFormat.prototype.biphase(data, 12);
    var params = {sampleRate:22050, channels: 1};
    wav = new Wav(params);
    wav.setBuffer(encoded);
    //var stream = [];
    //while (!wav.eof()) {
    //    stream.push(wav.getBuffer(1000));
    //}
    var stream = wav.getBuffer(encoded.length);
    return stream;
};

TapeFormat.prototype.biphase = function(data, halfperiod) {
    var w = new Int8Array(data.length * 8 * 2 * halfperiod);
    const period = halfperiod * 2;
    var dptr = 0;
    for (var i = 0, end = data.length; i < end; i += 1) {
        let octet = data[i];
        for (var b = 0; b < 8; ++b, octet <<= 1) {
            let phase = (octet & 0200) ? -128 : 127;
            for (var q = 0; q < halfperiod; ++q) w[dptr++] = phase;
            phase = phase ^ 255;
            for (var q = 0; q < halfperiod; ++q) w[dptr++] = phase;
        }
    }
    return w;
};
