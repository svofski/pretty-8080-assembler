    ; 🐟 для Радио-86РК
    .tape rk-bin
    .binfile hellork
    .org 0
prompt  equ 0F86Ch
puts    equ 0F818h

    lxi hl, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


