    ; 🐟 для Орион-128
    .project hellorion
    .tape orion-rko ; формат ленты Ориона RKO
    ;.tape orion-ord ; формат ORDOS ORD/BRU
    ;.tape orion-bru ; формат ORDOS ORD/BRU

    .org 0
prompt  equ 0F86Ch
puts    equ 0F818h
getc    equ 0F803h

    lxi h, msg
    call puts
    call getc
    jmp prompt

msg:
    db 1fh,'priwet, mir!',0dh,0ah,0
