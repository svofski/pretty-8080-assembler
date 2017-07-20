    ; 🐟 для Специалиста
    .tape специалистъ-rks   ; формат ленты для wav
    ; .tape специалистъ-mon ; формат с именем
    .binfile hello.rks      ; имя файла
    .download tape          ; формат двоичного файла .spec
    ; .download bin         ; формат двоичного файла .bin без заголовков
    .org 0
    prompt  equ 0C800h
    puts    equ 0C818h

    lxi hl, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet lunatikam!',0dh,0ah,0
