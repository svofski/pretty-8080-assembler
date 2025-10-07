    ; 🐟 для Радио-86РК
    .project hello.rk 
    .tape rk-bin
    .org 0
prompt  equ 0F86Ch
puts    equ 0F818h

    lxi h, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


