        ; 🐟  check out other examples by clicking on the fish
        ; 8080 assembler code
        .project test.com
        .tape v06c-rom
        ; target for generated loadable wav-file:
        ;   rk-bin          Радио-86РК 
        ;   microsha-bin    Микроша
        ;   v06c-rom        Вектор-06ц ROM
        ;
        ; Use Alt-1/2... to quickly switch buffers (Linux: Ctrl, Mac: Opt)
        ; Press Ctrl+Alt+B or Ctrl+Alt+C to launch Emulator (Mac: Cmd+Opt)
        ; 
        ; Check out the shawarma menu. Right-click to quickly browse the editor themes.
        ;
        ; The project is persisted in localStorage. You can export projects to disk
        ; using Export ZIP feature in the toolbar below. Use Import ZIP to 
        ; load them back.

        .include defines.inc  ; contains nice ALIGN(N) define

#define WITH_DELAY
#define USE_DB64 ; see resource.inc (Alt+2)
#define BDOS(fn) mvi c, fn \ call bdos
#define WRITESTR(str) lxi d, str \ BDOS(9)

bdos    .equ 5
intv    .equ 38h
        .org 100h
        jmp begin
        .db 27
msg:
        .db 'Assembled by Pretty 8080 Assembler',0dh,0ah,'$'
yeah: 	; include another buffer
        .include test-res.inc
begin:
        WRITESTR(msg)
        call delay
        WRITESTR(yeah)
        ret

delay:
#ifdef WITH_DELAY
        mvi a, 33
        hlt
        dcr a
        jnz .-2
#endif
        ret

        ALIGN(256)
        .db 'Aligned to 256 byte boundary'

; use this to customise vim mode (you may need to reload the page, press F5)
; vim: imap jj <Esc>
