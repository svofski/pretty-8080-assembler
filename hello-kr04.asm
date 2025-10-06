    ; 🐟 для Электроники КР-04
    .project hellokr04.rk 
    .tape kr04-bin
    .org 0
prompt  equ 0F86Ch
puts    equ 0F818h
getc    equ 0F803h

    lxi hl, msg
    call puts
    call getc
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


