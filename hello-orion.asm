    ; 🐟 для Орион-128
    .project hello.rko 
    .tape orion-rko
    ; .tape orion-ord
    ; .tape orion-bru

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
