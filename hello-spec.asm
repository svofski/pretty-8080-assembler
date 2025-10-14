    ; 🐟 для Специалиста
    .project hellospec
    .tape specialist-rks     ; формат ленты Специалиста RKS без имени
    ;.tape specialist-nrks     ; формат ленты Специалиста RKS с именем
    .org 0
    prompt  equ 0C800h
    puts    equ 0C818h

    lxi h, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet lunatikam!',0dh,0ah,0
