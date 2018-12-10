    ; 🐟 для Микро-80
    .tapfile hellom80.rk rk-bin ; имя файла для монитора
    .binfile hellom80.bin ; формат двоичного файла .bin без заголовков
    .org 0
prompt  equ 0F82Dh
puts    equ 0F818h

    lxi hl, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


