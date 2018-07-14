/* Tape stuff */

var TapeFormat = function(fmt, forfile) {
    this.format = null;
    this.variant = null;
    this.speed = 12;
    this.forfile = forfile || false; /* true if no leaders, no sync bytes */
    switch (fmt) {
        case 'rk-bin':
        case 'rk86-bin':
        case '86rk-bin':
            this.format = TapeFormat.prototype.nekrosha;
            this.variant = 'rk';
            this.speed = 12;
            break;
        case 'mikrosha-bin':
        case 'microsha-bin':
        case 'microcha-bin':
        case 'necrosha-bin':
        case 'nekrosha-bin':
        case 'necro-bin':
        case 'nekro-bin':
            this.format = TapeFormat.prototype.nekrosha;
            this.variant = 'mikrosha';
            this.speed = 12;
            break;
        case 'partner-bin':
            this.format = TapeFormat.prototype.nekrosha;
            this.variant = 'rk';
            this.speed = 8;
            break;
        case 'v06c-rom':
            this.format = TapeFormat.prototype.v06c_rom;
            this.speed = 5;
            break;
        case 'krista-rom':
            this.format = TapeFormat.prototype.krista;
            this.speed = 8;
            break;
        case 'ÓÐÅÃÉÁÌÉÓÔß-rks': // кои-8 факъ е
        case 'spetsialist-rks':
        case 'specialist-rks':
        case 'spec-rks':
            this.format = TapeFormat.prototype.specialist;
            this.speed = 9;
            this.variant = null;
            break;
        case 'ÓÐÅÃÉÁÌÉÓÔß-mon': // кои-8 факъ е
        case 'spetsialist-mon':
        case 'specialist-mon':
        case 'spec-mon':
            this.format = TapeFormat.prototype.specialist;
            this.speed = 9;
            this.variant = "name-header";
            break;
    }
    this.makewav = TapeFormat.prototype.makewav;
    return this;
}

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

    // rk-style checksum
    var cs_hi = 0;
    var cs_lo = 0;

    // microsha-style checksum
    var csm_hi = 0;
    var csm_lo = 0;

    var dptr = 0;
    if (!this.forfile) {
        for (var i = 0; i < 256; ++i) {
            data[dptr++] = 0;
        }
        data[dptr++] = 0xe6;
    }

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

        if (i % 2 === 0) {
            csm_lo ^= octet;
        } else {
            csm_hi ^= octet;
        }
    }

    console.log('checksum rk=', Util.hex8(cs_hi&0377), Util.hex8(cs_lo&0377));
    console.log('checksum microsha=', Util.hex8(csm_hi&0377), 
            Util.hex8(csm_lo&0377));

    if (this.variant === 'mikrosha') {
        data[dptr++] = csm_hi & 0377;
        data[dptr++] = csm_lo & 0377;
    } else {
        data[dptr++] = 0;
        data[dptr++] = 0;
    }
    data[dptr++] = 0xe6;

    /* rk86 checksum */
    data[dptr++] = cs_hi & 0377;
    data[dptr++] = cs_lo & 0377;
    var end = dptr;
    data[dptr++] = 0;
    data[dptr++] = 0;
    data[dptr++] = 0;
    data[dptr++] = 0;
    data[dptr++] = 0;
    if (this.forfile) {
        this.data = data.slice(0, end);
    } else {
        this.data = data;
    }
    return this;
};

TapeFormat.prototype.makewav = function()
{
    var encoded = TapeFormat.prototype.biphase(this.data, this.speed || 12);
    var params = {sampleRate:22050, channels: 1};
    wav = new Wav(params);
    wav.setBuffer(encoded);
    var stream = wav.getBuffer(encoded.length);
    return stream;
}

TapeFormat.prototype.biphase = function(data, halfperiod) {
    var w = new Uint8Array(data.length * 8 * 2 * halfperiod);
    const period = halfperiod * 2;
    var dptr = 0;
    for (var i = 0, end = data.length; i < end; i += 1) {
        let octet = data[i];
        for (var b = 0; b < 8; ++b, octet <<= 1) {
            //let phase = (octet & 0200) ? -128 : 127;
            let phase = (octet & 0200) ? 32 : (255 - 32);
            for (var q = 0; q < halfperiod; ++q) w[dptr++] = phase;
            phase = phase ^ 255;
            for (var q = 0; q < halfperiod; ++q) w[dptr++] = phase;
        }
    }
    return w;
};

/* 4[ 25[00] 25[55] ]  record preamble
 * 16[00]   block preamble
 *  4[55] [E6] 
 *      4[00] 25[filename] 2[00]  [hi(addr)] [block count] [block number] [cs0]
 *  4[00] [E6]
 *      [80] [cs0] 
 *      32[data] [checksum_data]
 *  4[00] [E6]
 *      [81] [cs0]
 *      32[data] [checksum_data]
 *   . . .
 *  4[00] [E6]
 *      [87] [cs0]
 *      32[data] [checksum_data]
 *
 * Sizes: 
 *      record preamble                 =200
 *
 *      one block:
 *          preamble             16
 *          name:                40
 *          data:                40 x 8
 *          total:                      =376
 *      N_blocks = (data size + 255) / 256
 *      Grand Total                     =200 + N_blocks * 376 + end padding 8
 */
TapeFormat.prototype.v06c_rom = function(mem, org, name) {
    var nblocks = Math.trunc((mem.length + 255) / 256);
    var data = new Uint8Array(200 + nblocks * 376 + 64);
    var dofs = 0;
    var sofs = 0;
    /* Preamble */
    for (var i = 0; i < 200; ++i) {
        data[dofs++] = ((Math.trunc(i / 25) % 2) === 0) ? 0x00 : 0x55;
    }

    /* Blocks */
    for (var block = 0; block < nblocks; ++block) {
        /* Checksum of the name subbbbblock */
        var cs0 = 0;

        /* Block preamble */
        for (var i = 0; i < 16; ++i) data[dofs++] = 0;  
        /* Name subblock id */
        for (var i = 0; i < 4; ++i) data[dofs++] = 0x55; 
        data[dofs++] = 0xE6;
        for (var i = 0; i < 4; ++i) data[dofs++] = 0x00;
        /* Name */
        for (var i = 0; i < 25; ++i) {
            cs0 += data[dofs++] = i < name.length ? name.charCodeAt(i) : 0x20;
        }
        data[dofs++] = data[dofs++] = 0; 
        /* High nibble of org address */
        cs0 += data[dofs++] = 0377 & (org >> 8); /* TODO: fix misaligned org */
        /* Block count */
        cs0 += data[dofs++] = nblocks;
        /* Block number */
        cs0 += data[dofs++] = nblocks - block;
        data[dofs++] = cs0 & 0377;

        /* Now the actual data: 8x32 octets */
        for (var sblk = 0x80; sblk < 0x88; ++sblk) {
            var cs = 0;
            for (var i = 0; i < 4; ++i) data[dofs++] = 0x00;
            data[dofs++] = 0xE6;
            cs += data[dofs++] = sblk;
            cs += data[dofs++] = cs0;
            for (var i = 0; i < 32; ++i) {
                cs += data[dofs++] = sofs < mem.length ? mem[sofs++] : 0;
            }
            data[dofs++] = 0377 & cs;
        }
    }
    this.data = data;
    return this;
};

/* Krista: Vector-06c ugly sister.
 *
 * 256[55]
 */
TapeFormat.prototype.krista = function(mem, org, name) {
    var nblocks = Math.trunc((mem.length + 255) / 256);
    var data = new Uint8Array(200 + nblocks * 376 + 64);
    var dofs = 0;
    var sofs = 0;
    /* Preamble */
    for (var i = 0; i < 200; ++i) {
        data[dofs++] = ((Math.trunc(i / 25) % 2) === 0) ? 0x00 : 0x55;
    }

    var cs = 0;
    /* Header block */
    data[dofs++] = 0xe6;
    data[dofs++] = 0xff;
    var startblock = 0377 & (org >> 8);
    cs = data[dofs++] = startblock;
    cs += data[dofs++] = 0377 & (startblock + nblocks);
    data[dofs++] = cs;
    //data[dofs++] = data[dofs++] = 0;
    
    /* Blocks */
    for (var block = startblock; block < startblock + nblocks; ++block) {
        cs = 0;

        /* Block preamble */
        for (var i = 0; i < 16; ++i) data[dofs++] = 0x55;  
        data[dofs++] = 0xE6;
        data[dofs++] = block; /* hi byte of block address */
        data[dofs++] = 0;     /* low byte of block address */
        data[dofs++] = 0;     /* payload size + 1 */
        
        /* Data: 256 octets */
        for (var i = 0; i < 256; ++i) {
            cs += data[dofs++] = sofs < mem.length ? mem[sofs++] : 0;
        }
        data[dofs++] = 0377 & cs;
    }
    this.data = data.slice(0, dofs + 16);
    return this;
};

/* Специалистъ: 
 * <RAKK_256>,0E6H,0D9H,0D9H,0D9H,<ASCII_NAME>,
 * <RAKK_768>,0E6H,<ADR_BEG>,<ADR_END>,<BIN_CODE>,<CHECK_SUM>
 */
TapeFormat.prototype.specialist = function(mem, org, name) {
    var data = new Uint8Array(mem.length + 1024 + 32 + name.length);

    // rk-style checksum
    var cs_hi = 0;
    var cs_lo = 0;

    var dptr = 0;
    if (!this.forfile) {
        if (this.variant === "name-header") {
            for (var i = 0; i < 256; ++i) {
                data[dptr++] = 0;
            }
            data[dptr++] = 0xe6;
            data[dptr++] = 0xd9;
            data[dptr++] = 0xd9;
            data[dptr++] = 0xd9;

            for (var i = 0; i < name.length; ++i) {
                data[dptr++] = name.charCodeAt(i);
            }
        }
        
        for (var i = 0; i < 768; ++i) {
            data[dptr++] = 0;
        }
        data[dptr++] = 0xe6;
    }

    // same as .rk but little endian
    data[dptr++] = org & 0377;
    data[dptr++] = (org >> 8) & 0377;
    data[dptr++] = (org + mem.length - 1) & 0377;
    data[dptr++] = ((org + mem.length - 1) >> 8) & 0377;

    for (var i = 0; i < mem.length; ++i) {
        let octet = mem[i];
        data[dptr++] = octet;
        cs_lo += octet;
        if (i < mem.length - 1) {
            cs_hi += octet + ((cs_lo >> 8) & 0377);
        }
        cs_lo &= 0377;
    }

    console.log('checksum=', Util.hex8(cs_hi&0377), Util.hex8(cs_lo&0377));

    /* rk86 checksum */
    data[dptr++] = cs_lo & 0377;
    data[dptr++] = cs_hi & 0377;

    var end = dptr;

    for (var i = dptr; i < mem.length; ++i) {
        mem[i] = 0;
    }

    if (this.forfile) {
        this.data = data.slice(0, end);
    } else {
        this.data = data;
    }

    return this;
};
