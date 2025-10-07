    ; 🐟 для Партнёра 01.01
    .project hellopartner.rk 
    .tape partner-bin 
    .org 0
prompt  equ 0F8C9h
puts    equ 0F818h

    lxi h, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


