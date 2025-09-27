// debugger support
class Debug
{
    cpu_state;
    line_map; // variable length, line_map[n] -> addr
    on_cpu_state_changed;
    dasm_data_source;

    reference_addr = 0; // when user goes to a specific addr in disassembly

    constructor()
    {
        this.dasm_data_source = new DasmDataSource('code-row', this);
    }

    update_line_map()
    {
        let line_map = [0];
        for (let line = 0, addr = 0; addr < 65536; ++line) {
            addr += i8080_opcode_length[this.cpu_state.mem[addr]];
            line_map.push(addr);
        }
        this.dasm_data_source.row_count = line_map.length - 1;

        this.line_map = line_map;
    }

    addr_to_line(addr)
    {
        let low = 0;
        let high = this.line_map.length - 1;
        while (low < high) {
            let mid = Math.floor((low + high) / 2);
            const val = this.line_map[mid];
            if (val < addr) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }

        return low;
    }

    line_to_addr(line)
    {
        return this.line_map[line];
    }

    set_cpu_state(cpu_state)
    {
        this.cpu_state = cpu_state;
        this.update_line_map();
        this.on_cpu_state_changed && this.on_cpu_state_changed();

        // benchmark
        // 4200ms per 10000 -> 0.42ms per entire line map update, not terrible
        //Util.measureFunctionTime(() => {for(let n = 0; n < 10000; ++n) this.update_line_map()});
    }
};

class DasmDataSource
{
    constructor(row_class, debug)
    {
        this.row_class = row_class;
        this.row_count = 65536;
        this.refresh = null;
        this.debug = debug;
    }

    // start and end are line numbers, not addresses
    // but we have our approximate line_map
    slice(start, end)
    {
        if (!this.debug.cpu_state || !this.debug.cpu_state.mem || !this.debug.cpu_state.mem.length) return [];

        let addr1 = this.debug.line_map[start];
        let addr2 = this.debug.line_map[end] || 0x10000;

        let [disassembled, pcline, pcaddr] = this.disass2(addr1, addr2);
        return disassembled;
    }

    disass2(addr1, addr2)
    {
        let breakpoints = debugger_collect_breakpoints();
        let cpu_pc = debug.cpu_state.pc;
        let data = new Uint8Array(3);
        let text = [];
        let addr = addr1;

        // reference points where we want to sync sharp
        let rp = [cpu_pc, this.debug.reference_addr, ...breakpoints]; 

        while (addr <= addr2) {
            let [das, next_addr] = this.dass_insn(addr, data, breakpoints);
            for (let p of rp) {
                if (p > addr && p < next_addr) {
                    [das, next_addr] = this.dass_db(addr, data, p - addr);
                    break;
                }
            }
            text.push(das);
            addr = next_addr;
        }

        return [text, 4, 0];
    }

    dass_db(pc, data, len)
    {
        let hexes = Util.format_hexes(data, len);
        let db = `<div class="dbgwin-insn">  ${Util.hex16(pc)}: ${hexes}DB ${hexes}</div>`;
        return [db, pc + len];
    }

    dass_insn(pc, data, breakpoints)
    {
        for (let i = 0; i < 3; ++i) {
            data[i] = this.debug.cpu_state.mem[(pc + i) & 0xffff];
        }
        let dass = I8080_disasm(data);
    
        let hexes = Util.format_hexes(data, dass.length);
    
        //let cur = cpu_state.pc === pc ? "dbg-dasm-current" : "";

        let pcline = cpu_state.pc === pc ? ' pc="true"' : '';
        let cur = "";
        if (breakpoints.indexOf(pc & 0xffff) != -1) {
            cur += " dbg-dasm-breakpoint";
        }

        let parts = dass.text.split(' ');
        let addrtxt = parts[parts.length - 1];
        let label, refaddr;
        if (addrtxt.length === 4) {
            let addr = Util.parseHexStrict(addrtxt);
            if (!isNaN(addr)) {
                refaddr = addrtxt;
                label = getLabelForAddr(addr);
                if (!label) {
                    label = getLabelForAddr(addr - 1);
                    if (label) {
                        label = label + "+1";
                    }
                }
            }
        }
        label = label || "";

        let reftext = "";
        if (refaddr !== undefined) {
            reftext = ` refaddr="${refaddr}"`;
        }

        if (pc === this.debug.reference_addr) {
            reftext +=' highlight="true"';
        }
        let text = `<div class="dbgwin-insn ${cur}"${reftext}${pcline}>  ${Util.hex16(pc)}: ${hexes}${dass.text}</div><div class="dbgwin-anno">${label}</div>`;
    
        pc = pc + dass.length;
    
        return [text, pc];
    }

};

