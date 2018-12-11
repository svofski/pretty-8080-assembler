    ; 🐟 для Специалиста
    .tape специалистъ-rks     ; формат rks
    ;.tape специалистъ-mon     ; формат mon с именем
    .project hello.rks
    .org 0
    prompt  equ 0C800h
    puts    equ 0C818h

    lxi hl, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet lunatikam!',0dh,0ah,0
