    ; 🐟 для Микроши
    .binfile hellosha.bin    ; имя файла без заголовков
    .tapfile hellosha.rk microsha-bin ; файл для монитора 
    .org 0
prompt  equ 0F89Dh
puts    equ 0F818h

    lxi hl, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


