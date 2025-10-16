// debugger support
class Debug
{
    cpu_state;
    line_map; // variable length, line_map[n] -> addr
    on_cpu_state_changed;
    dasm_data_source;
    reference_addr = 0; // when user goes to a specific addr in disassembly
    //
    stopped = false;
    extra_breakpoints = {};

    constructor()
    {
        this.dasm_data_source = new DasmDataSource('code-row', this);
    }

    // pause/step-in/step-over/step-out
    command(subcmd, url)
    {
        let target = debugger_target();
        if (!target) return;
        target.postMessage({cmd: "debugger", subcmd: subcmd}, url);
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

    refresh_window(s, code_addr)
    {
        // regs
        let reg_af = (s.regs[7] << 8) | (s.psw);
        let reg_bc = (s.regs[0] << 8) | (s.regs[1]);
        let reg_de = (s.regs[2] << 8) | (s.regs[3]);
        let reg_hl = (s.regs[4] << 8) | (s.regs[5]);

        let mkreg = (name,val) => {
            return `<div class="dbgwin-text">${name}=<div class="dbgwin-clickable inline" dbg-reg="${name}" dbg-attr="register" contenteditable="true">${Util.hex16(val)}</div></div>`;
        };

        $("#dbg-registers").innerHTML = 
            mkreg("AF", reg_af) +
            mkreg("BC", reg_bc) +
            mkreg("DE", reg_de) +
            mkreg("HL", reg_hl) +
            mkreg("SP", s.sp) +
            mkreg("PC", s.pc);

        // psw flags
        let mkbit = (name,mask) => {
            let val = (s.psw & mask) ? 1 : 0;
            if (name === "IFF")
                val = s.iff ? 1 : 0;
            name = name.padStart(3, " ");
            return `<div class="dbgwin-text">${name}=<div class="dbgwin-clickable inline" dbg-mask="${mask}" dbg-attr="psw" dbg-bit="${name}" contenteditable="true">${val}</div></div>`;
        };

        let psw_text = 
            mkbit("C", 0x01) +
            mkbit("P", 0x04) +
            mkbit("Z", 0x40) +
            mkbit("S", 0x80) +
            mkbit("AC", 0x10) +
            mkbit("IFF", 0x00);

        $("#dbg-psw").innerHTML = psw_text;

        // stack
        let stack_text = "";
        for (let n = 0; n < 16; n += 2) {
            let sp2 = s.sp + n;
            let val = s.mem[sp2] | (s.mem[sp2 + 1] << 8);
            stack_text += `<div class="dbgwin-text">SP+${Util.hex8(n)}: <div class="dbgwin-clickable inline" dbg-attr="breakpoint">${Util.hex16(val)}</div></div>`;
        }
        $("#dbg-stack").innerHTML = stack_text;

        // breakpoints
        let bpt_text = "";
        for (let a in s.breakpoints) {
            bpt_text += `<div class="dbgwin-clickable" dbg-attr="breakpoint">${Util.hex16(a)}</div>`;
        }
        if (bpt_text.length == 0) {
            bpt_text = "<div>&nbsp;&nbsp;&nbsp;&nbsp;</div>";
        }
        $("#dbg-breakpoints").innerHTML = bpt_text;

        // mem
        $("#dbg-mem-header").innerText = "      .0 .1 .2 .3 .4 .5 .6 .7 .8 .9 .A .B .C .D .E .F    0123456789ABCDEF";
        let dbg_mem = $("#dbg-mem");
        let addr = dbg_mem.attributes.addr || 0; 

        // refresh data in the hex dump view
        dump_scroller && dump_scroller.data.set_mem(s.mem);
        this.attach_dbg_mem_inplace(dbg_mem, s.mem);      // FIXME -- maybe once is enough? see attach_dbg_code_inplace

        //dasm_scroller && dasm_scroller.data.set_mem(s.mem);
        this.set_cpu_state(cpu_state);

        // 
        // handlers for clickable items
        //

        // clicks in breakpoints table in the debugger sheet
        document.querySelectorAll('[dbg-attr="breakpoint"]').forEach(item => {
            item.onclick = (e) => {
                let addr = parseInt('0x' + e.srcElement.innerText);
                if (!isNaN(addr) && addr >= 0 && addr <= 0xffff) {
                    show_editor_for_addr(addr);
                    this.render_code_window(addr);
                }
            };
        });


        // register inplace editor
        document.querySelectorAll('[dbg-attr="register"]').forEach(item => {
            let originalText;
            let previousText;
            item.addEventListener('focus', () => {
                previousText = originalText = item.innerText;
            });
            item.addEventListener('blur', () => {
                console.log("New value for: ", item.attributes["dbg-reg"], item.innerText);
                this.set_register(item.attributes["dbg-reg"].value.toLowerCase(), Util.parseHexStrict(item.innerText));
            });

            item.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.srcElement.blur()
                }
                else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.srcElement.innerText = originalText;
                    e.srcElement.blur();
                }
            });

            item.addEventListener('input', function(e) {
                if (item.innerText.length > 4) {
                    item.innerText = item.innerText.slice(item.innerText.length - 4, item.innerText.length);
                }

                let n = Util.parseHexStrict(item.innerText);
                if (isNaN(n) || n < 0 || n > 0xffff) {
                    item.innerText = previousText;
                }

                // move caret to the end
                const range = document.createRange();
                range.selectNodeContents(item);
                range.collapse(false);
                const sel = window.getSelection();
                console.log(sel);
                sel.removeAllRanges();
                sel.addRange(range);

                previousText = item.innerText;
            });
        });

        document.querySelectorAll('[dbg-attr="psw"]').forEach(item => {
            let originalText;
            let previousText;
            item.addEventListener('focus', () => {
                previousText = originalText = item.innerText;
            });
            item.addEventListener('blur', () => {
                let name = item.attributes["dbg-bit"].value;
                let mask = parseInt(item.attributes["dbg-mask"].value);
                let on = item.innerText === "1";

                if (name === "IFF") {
                    this.set_register("iff", on ? 1 : 0);
                    return;
                }

                let psw = (s.psw & ~mask) | ((on ? mask : 0));
                let reg_af = (s.regs[7] << 8) | psw;

                this.set_register("af", reg_af);
            });

            item.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.srcElement.blur()
                }
                else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.srcElement.innerText = originalText;
                    e.srcElement.blur();
                }
            });

            item.addEventListener('input', function(e) {
                if (item.innerText.length > 1) {
                    item.innerText = item.innerText.slice(item.innerText.length - 1, item.innerText.length);

                    if (item.innerText.length && "01".indexOf(item.innerText[0]) < 0) {
                        item.innerText = previousText;
                    }

                    // move caret to the end
                    const range = document.createRange();
                    range.selectNodeContents(item);
                    range.collapse(false);
                    const sel = window.getSelection();
                    console.log(sel);
                    sel.removeAllRanges();
                    sel.addRange(range);

                    previousText = item.innerText;
                }
            });
        });

        this.render_code_window(code_addr);
    }


    static MODE_ADDR = 0;
    static MODE_BYTE = 1;

    // inplace editor for dbg-mem view
    dbg_mem_inplace = null;
    attach_dbg_mem_inplace(dbg_mem, mem)
    {
        const metrics = Util.getCharMetrics(dbg_mem);
    
        dbg_mem.removeEventListener("mousedown", this.dbg_mem_inplace);
    
        let open_inplace = function(mode, addr) {
            const row = Math.floor(addr / 16);
            const padding = Util.get_computed_padding(dbg_mem);
            const left = padding.left + (mode == Debug.MODE_ADDR ? 0 : (6 + (addr % 16) * 3) * metrics.w);
            const top  = /*padding.top +*/ row * metrics.h;
    
            let overlay = Debug.create_inplace_overlay(left, top, mode == Debug.MODE_ADDR ? 5 : 3, metrics);
            dbg_mem.appendChild(overlay);
    
            if (mode == Debug.MODE_ADDR) {
                let addr_text = Util.hex16(row * 16);
                overlay.value = addr_text;
            }
            else {
                let pos = 6 + (addr % 16) * 3;
                overlay.value = Util.hex8(mem[addr]);
            }
    
            let previousValue = overlay.value, originalValue = overlay.value;
            setTimeout(function() {
                overlay.focus();
                overlay.addEventListener('blur', () => {
                    dbg_mem.removeChild(overlay);
                });
                overlay.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        overlay.blur();
    
                        if (mode == Debug.MODE_ADDR) {
                            // Enter and Tab confirms the input
                            let addr = Util.parseHexStrict(overlay.value);
                            if (!isNaN(addr) && addr >= 0 && addr <= 0xffff) {
                                debug.scroll_mem_to(addr);
                            }
                        }
                        else {
                            let val = Util.parseHexStrict(overlay.value);
                            if (!isNaN(val) && val >= 0 && val <= 0xff) {
                                debug.write_byte(addr, val);
                            }
                            setTimeout(() => { open_inplace(mode, (addr + 1) & 0xffff); }, 50);
                        }
                    }
                    else if (e.key === 'Escape') {
                        e.preventDefault();
                        overlay.value = originalValue;
                        overlay.blur();
                        $("#dbg-mem").focus();
                    }
                });
                Debug.attach_hex_validator(overlay, mode);
            }, 50);
        };

        // mad inplace editor in dbg-mem
        this.dbg_mem_inplace = function(e) {
            const rect = dbg_mem.getBoundingClientRect();
            const x = e.clientX - rect.left + dbg_mem.scrollLeft;
            const y = e.clientY - rect.top  + dbg_mem.scrollTop;
    
            const col = Math.floor(x / metrics.w);
            const row = Math.floor(y / metrics.h);
    
            //console.log("dbg_mem_inplace click row", row, "col", col);
    
            let mode = Debug.MODE_ADDR, mem_addr; 
            let addr = row * 16;
            if (col > 54) {
                return;
            }
            if (col > 6) {
                mode = Debug.MODE_BYTE;
                addr += Math.floor((col - 7) / 3);
            }
    
            open_inplace(mode, addr);
        };
    
        dbg_mem.addEventListener("mousedown", (e) => this.dbg_mem_inplace(e));
    }

    render_code_window(set_addr)
    {
        if (set_addr !== undefined) {
            this.reference_addr = set_addr;
            dasm_scroller.scrollToLine(this.addr_to_line(set_addr) - 4);
        }
        else {
            dasm_scroller.updateVisibleItems();
        }
    }

    forced_disable = {};
    force_disable_button(id, force)
    {
        if (force) {
            this.forced_disable[id] = true;
        }
        else {
            delete this.forced_disable[id];
        }
    }

    update_controls()
    {
        let visible = this.visible();
        document.querySelectorAll('[id^="dbg-"][id$="-btn"]')
            .forEach(item => {
                if (!visible) {
                    item.classList.add("disabled");
                    return;
                }
    
                if (this.stopped) {
                    item.classList.remove("disabled");
                }
                else {
                    if (item.id != "dbg-pause-btn") {
                        item.classList.add("disabled");
                    }
                    else {
                        item.classList.remove("disabled");
                    }
                }

                if (this.forced_disable[item.id]) {
                    item.classList.add("disabled");
                }

            });
        if (this.stopped) {
            $("#debugger-sheet").classList.remove("disabled");
        }
        else {
            $("#debugger-sheet").classList.add("disabled");
        }
    }

    animate_stop_button()
    {
        let btn = $("#dbg-pause-btn");
        btn.classList.add("attract");
        setTimeout(function() {
            btn.classList.remove("attract");
        }, 1500);
    }

    visible()
    {
        return !$("#debugger-sheet").classList.contains("hidden");
    }

    show(on)
    {
        if (on) {
            $("#debugger-sheet").classList.remove("hidden")
            $("#debugger-controls").classList.remove("hidden")
        }
        else {
            $("#debugger-sheet").classList.add("hidden");
            $("#debugger-controls").classList.add("hidden")
        }
        debug.update_controls();
    }

    // collect all breakpoints from all editor sessions
    collect_breakpoints()
    {
        let addrs = [];
        for (let file of Object.keys(sessions)) {
            let s = sessions[file];
            let breakpoints = s.getBreakpoints();
            for (let line in breakpoints) {
                let addr = s.gutter_contents[line].addr;
                addrs.push(addr);
            }
        } 
        for (let addr in debugger_extra_breakpoints) {
            addrs.push(parseInt(addr));
        }

        return addrs;
    }

    toggle_breakpoint(addr)
    {
        let [file, row] = find_addr_line(addr, true);
        if (file) {
            return session_toggle_breakpoint(sessions[file], row);
        }

        let target = debugger_target();
        if (!target) return;

        // breakpoint outside available source
        if (debugger_extra_breakpoints[addr]) {
            target.postMessage({cmd: "debugger", subcmd: "del-breakpoints", addrs: [addr]});
            delete debugger_extra_breakpoints[addr];
        }
        else {
            debugger_extra_breakpoints[addr] = 1;
            target.postMessage({cmd: "debugger", subcmd: "set-breakpoints", addrs: [addr]});
        }
    }

    scroll_mem_to(addr)
    {
        let mem = $("#dbg-mem");
        const metrics = Util.getCharMetrics(mem);
    
        const row = Math.max(0, Math.floor(addr / 16) - 2);
        mem.scrollTo(0, metrics.h * row);
    }

    set_breakpoints(target)
    {
        let addrs = this.collect_breakpoints();
        target.postMessage({cmd: "debugger", subcmd: "del-breakpoints", addrs: []}, location.href);
        target.postMessage({cmd: "debugger", subcmd: "set-breakpoints", addrs: addrs}, location.href);
    }

    set_register(regname, value)
    {
        let iframe = $("#emulator-iframe");
        let target = iframe ? iframe.contentWindow : null;
        if (!target) return false;

        if (!isNaN(value) && value >= 0 && value <= 0xffff) {
            target.postMessage({cmd: "debugger", subcmd: "set-register", regname: regname, value: value});
            return true;
        }
        return false;
    }

    write_byte(addr, value)
    {
        let iframe = $("#emulator-iframe");
        let target = iframe ? iframe.contentWindow : null;
        if (!target) return false;

        if (!isNaN(value) && value >= 0 && value <= 0xff) {
            target.postMessage({cmd: "debugger", subcmd: "write-byte", addr: addr, value: value});
            return true;
        }
        return false;
    }

    attach_dbg_code_inplace()
    {
        let dbg_code = $("#dbg-code");
        const padding = Util.get_computed_padding(dbg_code);

        this.open_inplace = function(row, col, addr) {
            let dbg_code = $("#dbg-code");
            const metrics = Util.getCharMetrics(dbg_code);
            const left = padding.left + col * metrics.w;
            const top  = /*padding.top +*/ row * metrics.h;

            let overlay = Debug.create_inplace_overlay(left, top, 5, metrics);
            dbg_code.appendChild(overlay);

            setTimeout(function() {
                overlay.focus();
                overlay.value = Util.hex16(addr);
                Debug.attach_hex_validator(overlay, Debug.MODE_ADDR);

                overlay.addEventListener('blur', () => {
                    dbg_code.removeChild(overlay);
                });
                overlay.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        overlay.blur();
                        $("#dbg-code").focus();
                        let newaddr = Util.parseHexStrict(overlay.value);
                        debug.jump_code(newaddr); // updates history
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        overlay.blur();
                        $("#dbg-code").focus();
                    }
                });
            }, 50);
        };

        dbg_code.addEventListener("mousedown", (e) => this.dbg_code_inplace(e));
    }

    dbg_code_inplace(e)
    {
        let dbg_code = $("#dbg-code");
        const padding = Util.get_computed_padding(dbg_code);
        let [row, col] = Util.getClickRowCol(e, dbg_code, 0, padding.top);
        let addr = this.line_to_addr(row);
        if (col < 3) {
            this.toggle_breakpoint(addr);
        }
        else if (col >= 3 && col <= 7) {
            this.open_inplace(row, 2, addr);
        }
        else {
            let [hexual, addr] = this.get_hexual(e);
            if (hexual && hexual.length == 4) {
                let [x, y] = this.get_navxy(e);
                this.open_nav(x, y, addr);
            }
            else {
                setTimeout(()=>this.close_nav(), 250);
            }
        }
    }

    get_navxy(e)
    {
        let dbg_code = $("#dbg-code");
        const padding = Util.get_computed_padding(dbg_code);
        let parentbox = $("#debugger-sheet").getBoundingClientRect();
        let [row, col] = Util.getClickRowCol(e, dbg_code, 0, padding.top);
        let element = dasm_scroller.getItemAtRow(row);
        if (element && element.childNodes[0]) {
            let bbox = element.childNodes[0].getBoundingClientRect();
            bbox.x -= parentbox.x;
            bbox.y -= parentbox.y;
            let x = bbox.x + bbox.width + 12;
            let y = bbox.y;
            return [x, y];
        }

        return [-1, -1];
    }

    get_hexual(e)
    {
        let dbg_code = $("#dbg-code");
        const padding = Util.get_computed_padding(dbg_code);
        let [row, col] = Util.getClickRowCol(e, dbg_code, 0, padding.top);
        let element = dasm_scroller.getItemAtRow(row);
        if (!element || element.childNodes.length === 0) return [null, null];
        let refaddr = element.childNodes[0].attributes["refaddr"];
        if (refaddr) {
            return [refaddr.value, Util.parseHexStrict(refaddr.value)];
        }
        return [null, null];
    }

    jump_code(addr) {
        {
            let state = {dasm_scroller_startIndex: dasm_scroller.startIndex};
            history.replaceState(state, '', '');
        }

        debug.render_code_window(addr);
        this.close_nav();

        let state = {dasm_scroller_startIndex: dasm_scroller.startIndex};
        history.pushState(state, '', '');
        console.log("history: push state=", state);
    }

    jump_data(addr) {
        debug.scroll_mem_to(addr);
        this.close_nav();
    }

    jump_edit(addr) {
        show_editor_for_addr(addr);
        this.close_nav();
    }

    open_nav(x, y, addr)
    {
        if (this.close_nav_timer) {
            if (this.nav_menu_addr === addr) return;
            this.close_nav();
        }
        let dbg_sheet = $("#debugger-sheet");


        let edit_click = can_show_editor_for_addr(addr) ? ()=>this.jump_edit(addr) : null; 

        let [menu, code_btn, data_btn, edit_btn] = 
            this.create_nav_overlay(x, y, 
                ()=>this.jump_code(addr), 
                ()=>this.jump_data(addr),
                edit_click);
        dbg_sheet.appendChild(menu);

        this.close_nav_timer = setTimeout(()=>this.close_nav(), 5000);
        menu.addEventListener('mouseleave', ()=>this.close_nav());

        this.nav_menu_addr = addr;

        dasm_scroller.scroller.removeEventListener('scroll', ()=>this.close_nav());
        dasm_scroller.scroller.addEventListener('scroll', ()=>this.close_nav());
    };

    static create_inplace_overlay(left, top, width, metrics)
    {
        let overlay = document.createElement("input");
        overlay.id = "overlay";
        overlay.style.left = left + "px";
        overlay.style.top  = top  + "px";
        overlay.style.width = metrics.w * width + "px";
        overlay.style.height = metrics.h + "px";
        return overlay;
    }
    
    create_nav_overlay(left, top, oncode_click, ondata_click, onedit_click)
    {
        let overlay = $("#nav-menu");
        let code, data, edit;
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "nav-menu";
    
            code = document.createElement("div");
            code.id = "nav-menu-code";
            code.className = "menu-like nav";
            code.innerText = "→CODE";
            overlay.appendChild(code);
    
            data = document.createElement("div");
            data.id = "nav-menu-data";
            data.className = "menu-like nav";
            data.innerText = "→DATA";
            overlay.appendChild(data);
    
            edit = document.createElement("div");
            edit.id = "nav-menu-edit";
            edit.className = "menu-like nav";
            edit.innerText = "→EDIT";
            overlay.appendChild(edit);
        }
        else {
            code = $("#nav-menu-code");
            data = $("#nav-menu-data");
            edit = $("#nav-menu-edit");
        }
    
        overlay.style.left = (left - 4) + "px";
        overlay.style.top = (top - 4) + "px";
    
        code.onclick = oncode_click;
        data.onclick = ondata_click;
    
        if (onedit_click) {
            edit.onclick = onedit_click;
            edit.classList.remove("hidden");
        }
        else {
            edit.classList.add("hidden");
        }
    
        overlay.classList.remove("hidden");
    
        return [overlay, code, data, edit];
    }

    static attach_hex_validator(input, mode)
    {
        let previousValue = input.value, originalValue = input.value;
        input.addEventListener('input', (e) => {
            const trimlen = mode == Debug.MODE_ADDR ? 4 : 2;
            const maxval = mode == Debug.MODE_ADDR ? 0xffff : 0xff;
            if (input.value.length > trimlen) {
                input.value = input.value.slice(input.value.length - trimlen, input.value.length);
            }
    
            let n = Util.parseHexStrict(input.value);
            if (isNaN(n) || n < 0 || n > maxval) {
                input.value = previousValue;
            }
    
            previousValue = input.value;
        });
    }

    nav_menu_addr = -1; // where the popup was invoked
    close_nav_timer;
    close_nav()
    {
        if (this.close_nav_timer) {
            clearTimeout(this.close_nav_timer);
            this.close_nav_timer = null;
        }
    
        let menu = $("#nav-menu");
        if (menu && menu.parentElement) {
            menu.classList.add("hidden");
        }
    
        this.nav_menu_addr = -1;
    };

    get_preferred_width()
    {
        let mem = $("#dbg-mem");
        const metrics = Util.getCharMetrics(mem);
        return metrics.w * 83 || 600; // TODO: we're querying the metrics before they're ready
    }
};



//
// DasmDataSource
//
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
        let breakpoints = debug.collect_breakpoints();
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

//
// DumpDataSource
//
class DumpDataSource
{
    constructor(row_class)
    {
        this.row_class = row_class;
        this.mem = [];
        this.row_count = 65536 / 16;
        this.refresh = null;
    }

    slice(start, end)
    {
        let data = [];
        for (let i = start; i < end; ++i) {
            let text = Util.dump_line(i * 16, this.mem)
            data.push(text);
        }
        return data;
    }

    set_mem(mem)
    {
        this.mem = mem;
        this.refresh && this.refresh();
    }
}

