    ; 🐟 для Специалиста
    ; .tape специалистъ-mon ; формат с именем
    .tapfile hello.rks специалистъ-rks     ; имя файла (rks)
    ;.tapfile hello.mon специалистъ-mon     ; имя файла (mon), формат с именем
    .org 0
    prompt  equ 0C800h
    puts    equ 0C818h

    lxi hl, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet lunatikam!',0dh,0ah,0
