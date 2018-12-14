        xra a \ mov a, b
        push psw
        mov a, b
        lxi h, mike+1;screw mike btw
        lxi sp, mike
        jmp $+3
        
mike:
        nop
bob:    shld mike \ shld mike\shld mike\shld mike;fec\k
        nop
        db 34,56,$77,"fork",037h,177q,mike&377q
        org 100
        jmp bob
        mvi a,-1        ; =ff
        mvi b,-2        ; =fe
        mvi c,-3        ; =fd
        mvi d,-4        ; =fc
        mvi e, -8       ; =f8
        mvi a, 255      ; =ff
        mvi a,-128      ; =80
        lxi b,-129
        lxi d,65535
        shld 65535
        shld 65536      ; overflow
        lxi h,65536     ; overflow
        lxi h,-32769
        mvi a,256       ; overlofw
        mvi a,-129      ; overflow
        mvi a, nonexistent
        lxi h,nonexistent
        shld nonexistent
        lxi sp,-32768
        lxi sp,-32767
        db64 TG9uZyBiaW5hcnkgaW5pdGlhbGl6YXRpb24gc2VjdGlvbnMgY2FuIGJlIGRlZmluZWQgdXNpbmcgYmFzZTY0LWVuY29kZWQgc3RyaW5ncyENCiQ=
        di;ck
        lxi a, 0        ; impossible
        dad psw         ; impossible
        push sp         ; impossible
        shld 0
        shld -1
        lxi sp,-1
        mvi a, bob-mike ; =1
        mvi b, mike-bob ; =-1
        mvi c,1111-1111 ; =0
        dad sp
        push psw
cthulhu:
        ftagn   ; this is actually a label
        lxi d,ftagn
        sui ftagn-cthulhu ; d6 00
        
