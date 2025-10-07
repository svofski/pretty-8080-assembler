    ; 🐟 для Микроши
    .project hellosha.rk
    .tape microsha-bin ; формат ленты 
    .org 0
prompt  equ 0F89Dh
puts    equ 0F818h

    lxi h, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


