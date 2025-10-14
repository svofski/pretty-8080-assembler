    ; 🐟 для Электроники КР-04
    .project hellokr04
    .tape kr04-rk ; формат ленты РК-86
    .org 0
prompt  equ 0F86Ch
puts    equ 0F818h
getc    equ 0F803h

    lxi h, msg
    call puts
    call getc
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


