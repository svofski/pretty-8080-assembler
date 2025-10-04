"use strict";

// Interface to emu80
// Copyright (c) 2025 Viktor Pykhonin


let emu80Ready = false;
let emu80Stopped = false;


// should be called after creating new emu80 iframe
function initEmu80Iframe(iframe)
{
    emu80Ready = false;

    iframe.addEventListener("load", () => {
        iframe.contentDocument.addEventListener("keydown", (event) => {
            const key = event.key;
            switch (key) {
                case "End":
                case "Home":
                case "PageUp":
                case "PageDown":
                event.preventDefault();
            }
            // Alt-Home,Up,Down
            if (event.altkey && (event.keyCode == 0x24 || event.keyCode == 0x26 || event.keyCode == 0x28))
                event.preventDefault();
        });
    });

    iframe.contentWindow.addEventListener("message", (e) => {
        const {cmd, file} = e.data;
        if (cmd === "loadfile") {
            console.log("message loadfile: ", file);
            emu80run(file);
        }
        if (cmd === "debugger") {
            emu80DbgCommand(e.data);
        }
    });
}


// load and run the file
async function emu80run(file)
{
    const array = await new Promise((resolve) => {
        const fileReader = new FileReader();
        fileReader.onloadend = (e) => resolve(fileReader.result);
        fileReader.readAsArrayBuffer(file);
    });


    const uint8Arr = new Uint8Array(array);
    const numBytes = uint8Arr.length * uint8Arr.BYTES_PER_ELEMENT;
    
    const iframe = document.getElementById("emulator-iframe");

    const fileId = iframe.contentWindow.Module._wasmEmuAllocateFileBuf(numBytes);
    const dataPtr = iframe.contentWindow.Module._wasmEmuGetFileBufPtr(fileId);
    const heapData = new Uint8Array(iframe.contentWindow.Module.HEAPU8.buffer, dataPtr, numBytes);
    heapData.set(uint8Arr);

    iframe.contentWindow.Module._wasmEmuOpenFile(fileId);
    iframe.focus();
}


function emu80DbgCommand(data)
{
    console.log("Debugger command: ", data.subcmd);

    const module = document.getElementById("emulator-iframe").contentWindow.Module;
    
    switch (data.subcmd) {
    case "pause":
        if (emu80Stopped) {
            // continue
            console.log("wasmDbgRun");
            module._wasmDbgRun();
            emu80Stopped = false;
        }
        else {
            // Stop
            console.log("wasmDbgPause");
            module._wasmDbgPause();
        }
        break;
    case "step-in": // single instruction
        if (emu80Stopped) {
            console.log("wasmDbgStepIn");
            module._wasmDbgStepIn();
        }
        break;
    case "step-over": // skip call/rst
        if (emu80Stopped) {
            console.log("wasmDbgStepOver");
            module._wasmDbgStepOver();
        }
        break;
    case "step-out":  // trace until return
        if (emu80Stopped) {
            console.log("wasmDbgStepOut");
            module._wasmDbgStepOut();
        }
        break;
    case "set-breakpoints":
       console.log("wasmDbgSetBreakpoints ", data.addrs.length);
        const ptrs = module._malloc(data.addrs.length * 4);
        module.HEAP32.set(data.addrs, ptrs / 4);
        module._wasmDbgSetBreakpoints(ptrs, data.addrs.length);
        module._free(ptrs);
        if (emu80Stopped) {
            emu80SendOk();
        }
        break;
    case "del-breakpoints":
       console.log("wasmDbgDelBreakpoints ", data.addrs.length);
        let ptrd = module._malloc(data.addrs.length * 4);
        module.HEAP32.set(data.addrs, ptrd / 4);
        module._wasmDbgDelBreakpoints(ptrd, data.addrs.length);
        module._free(ptrd);
        if (emu80Stopped) {
            emu80SendOk();
        }
        break;
    case "set-register":
        if (emu80Stopped) {
            console.log("wasmDbgSetRegister");
            module._wasmDbgSetRegister(data.regname, data.value);
            if (data.regname === "pc") {
                window.postMessage({type: "debugger", what: "stopped", "cpu_state": emu80GetCpuState()});
            }
            else {
                emu80SendOk();
            }
        }
        break;
    case "write-byte":
        if (emu80Stopped) {
            console.log("wasmDbgWriteByte");
            module._wasmWriteByte(data.addr, data.value);
            emu80SendOk();
        }
        break;
    }
}


function emu80GetCpuState()
{
   console.log("emu80GetCpuState");
    const module = document.getElementById("emulator-iframe").contentWindow.Module;

    const dataPtr = module._wasmDbgGetState();
    const regsPtr = module.getValue(dataPtr, 'i32');
    const breakpointsPtr = module.getValue(dataPtr + 4, 'i32');
    const memPtr = module.getValue(dataPtr + 8, 'i32');

    let breakpoints = {};
    const nBreakpoints = module.getValue(breakpointsPtr);
    const breakponntsArray = new Uint16Array(module.HEAPU16.buffer, breakpointsPtr + 2, nBreakpoints);
    for (let addr of breakponntsArray)
       breakpoints[addr] = 1;
    
    const regsArray = new Uint16Array(module.HEAPU16.buffer, regsPtr, 7);

    const af = regsArray[0];
    const bc = regsArray[1];
    const de = regsArray[2];
    const hl = regsArray[3];
    const sp = regsArray[4];
    const pc = regsArray[5];
    const iff = regsArray[6];

    const memArray = new Uint8Array(module.HEAPU8.buffer, memPtr, 0x10000);
    const mem = new Uint8Array(memArray);

    module._wasmDbgFreeState();

    const regs = [bc >> 8, bc & 0xff, de >> 8, de & 0xff, hl >> 8, hl & 0xff, 0, af >> 8];

    let s = {
        pc: pc,
        sp: sp,
        iff: iff,
        psw: af & 0xFF,
        //regs: regs,
        regs: [bc >> 8, bc & 0xff, de >> 8, de & 0xff, hl >> 8, hl & 0xff, 0, af >> 8],
        mem: mem,
        mem_cw: 0,
        breakpoints: breakpoints,
    };
  console.log("emu80Stopped = ", emu80Stopped);
    return s;
}


function emu80SendOk()
{
   console.log("emu80SendOk");
    window.postMessage({type: "debugger", what: "ok", "cpu_state": emu80GetCpuState()});
}


// callback from wasm, called first time when emu80 is ready
function updateConfig()
{
    if (!emu80Ready) {
       console.log("Ready!");
        emu80Ready = true;
        postMessage({type: "ready"}, "*");
    }
}


// callback from wasm, called on breakpoint or manual debug request
function debugRequest()
{
   console.log("debugRequest");
    emu80Stopped = true;
    window.postMessage({type: "debugger", what: "stopped", "cpu_state": emu80GetCpuState()});
}
