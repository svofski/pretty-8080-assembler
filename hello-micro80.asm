    ; 🐟 для Микро-80
    .project hellom80
    .tape micro80-rk ; формат ленты РК-86
    .org 0
prompt  equ 0F82Dh
puts    equ 0F818h

    lxi h, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


