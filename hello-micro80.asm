    ; 🐟 для Микро-80
    .tape micro80-bin ; формат ленты
    .project hellom80.rk 
    .org 0
prompt  equ 0F82Dh
puts    equ 0F818h

    lxi hl, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


