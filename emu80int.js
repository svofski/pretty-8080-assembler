"use strict";

// Interface to emu80
// Copyright (c) 2025 Viktor Pykhonin


let emu80Ready = false;

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


// should be called after creating new emu80 iframe
function emu80OnNewFrame(iframe)
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
}


// callback from wasm, called first time when emu80 is ready
function updateConfig()
{
    if (!emu80Ready) {
        emu80Ready = true;
        postMessage({type: "ready"}, "*");
    }
}
