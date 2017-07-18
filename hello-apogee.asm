    ; 🐟 для Апогея БК-01
    .tape rk-bin
    .binfile helloapogee
    .org 0
prompt  equ 0F875h
puts    equ 0F818h

    lxi hl, msg
    call puts
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0


