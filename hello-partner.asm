    ; 🐟 для Партнёра 01.01
    .tape partner-bin       ; формат ленты для wav
    .binfile hellopartner.rk; имя файла
    .download tape      ; формат двоичного файла .rk
    ; .download bin     ; формат двоичного файла .bin без заголовков
    .org 0
prompt  equ 0F8C9h
puts    equ 0F818h

    lxi hl, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


