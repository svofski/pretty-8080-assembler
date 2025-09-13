        ; 🐟  (try me)
        ; 8080 assembler code
        .project test.com
        .tape v06c-rom
        ; target for generated loadable wav-file:
        ;   rk-bin          Радио-86РК 
        ;   microsha-bin    Микроша
        ;   v06c-rom        Вектор-06ц ROM
        ;
        ; Use Alt-1/2... to quickly switch buffers
        ; Press Ctrl+Alt+B to launch Emulator
        ; 
        ; Check out the shawarma menu for themes and vim mode
        ; Use right-click to quickly browse through the editor themes
        ;

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

; use this to customise vim mode (you may need to reload the page, press F5)
; vim: imap jj <Esc>
