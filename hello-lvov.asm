    ; 🐟 для ПК-01 Львов
    .project hellolvov
    .tape lvov-lvt ; формат LVT
    ;.tape lvov-cas ; формат ленты MSX

    .org 8000h

cls       equ 0F836h
locate    equ 0F82Dh
puts      equ 0E4A4h
rect      equ 0F827h

loc_col   equ 0BE3Eh
loc_row   equ 0BE3Fh
cursor_   equ 0BE3Dh
x1        equ 0BE50h
y1        equ 0BE51h
x2        equ 0BE57h
y2        equ 0BE58h
grf_color equ 0BE52h

    call cls

    mvi a, 11
    sta loc_row
    mvi a, 9
    sta loc_col
    mvi a, 0ffh ; cursor off
    sta cursor_
    call locate

    lxi h, msg
    call puts

    mvi a, 94
    sta y1
    mvi a, 118
    sta y2
    mvi a, 49
    sta x1
    mvi a,147
    sta x2
    mvi a, 3
    sta grf_color
    call rect

    hlt

msg:
    db 'HELLO, WORLD !',0
