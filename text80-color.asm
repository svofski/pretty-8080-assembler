		; 🐟 для Вектора-06ц
		;
		; Пример печати цветного текста в режиме 512х256 
		;
		; svofski, ivagor  2022
		;
                .encoding cp1251
rastint	        .equ 38h ; прервывание обратного хода луча

		.org 100h
		; стандартная точка входа .rom файла 
		di              ; запретить прерывания
		xra a               
		out 10h         ; выключить квазидиск 

;prepare font
		lxi b,256*3
		lxi h,fontsrc
PrepareFontLoop:
		inx h
		mov d,m
		xchg
		dad h\ rar
		dad h\ rar
		dad h\ rar
		dad h\ rar
		dad h\ rar
		dad h\ rar
		dad h\ rar
		dad h\ rar
		xchg
		mov m,a
		inx h
		dcx b
		mov a,b
		ora c
		jnz PrepareFontLoop
Restart:	
		lxi sp, $100    ; инициализировать указатель стека
  
		mvi a, 0c9h     ; код инструкции RET
		sta rastint     ; инициализировать обработчик RST7
  
		mvi a, 0c3h
		sta 0
		lxi h, Restart
		shld 1

		call clrscr     ; очистить экран
        
		; настроить палитру и включить режим 512 точек
		ei
		hlt
		lhld palette_ptr
		mov e, m
		inx h
		mov d, m
		xchg
		call colorset
		; палитра для следующего БЛК+СБР
		lhld palette_ptr
		inx h \ inx h
		mov e, m
		inx h
		mov d, m
		dcx h
		;
		xra a
		ora e \ ora d
		jnz $+6
		lxi h, palette_tbl
		shld palette_ptr

		lxi h, stop_benchmark
		shld rastint+1
		mvi a, 0c3h

		ei
		hlt
		; автостоп по прерыванию
		sta rastint
        
		;; включить бенчмарк
		;
		;ei
		;mvi a, 0x30
		;sta char
		;jmp lup
		;
        
		mvi a,3
		call term_setbitplanemask
        
		; курсор в 30, 16
		lxi h, (53*256) + (16*8)
		mvi c,15
lup:
		push b
		push h
		call term_gotoxy
		call term_setcolor
        
		lxi h, hello
		call term_puts
		pop h
		mvi a,8\ add l\ mov l,a
		pop b
		dcr c
		jnz lup
        
		lxi h, (28*256) + (3*8)
		call term_gotoxy
		lxi h, msg_nextpal
		call term_puts
        
        
		call  chartbl

		mvi a,1
		call term_setbitplanemask
		lxi h, (20*256) + (9*8)
		call term_gotoxy
		mvi c,3
		call term_setcolor
		lxi h, hello14
		call term_puts
		lxi h, (20*256) + (8*8)
		call term_gotoxy
		mvi c,3*4
		call term_setcolor
		lxi h, hello14
		call term_puts
		
		mvi a,2
		call term_setbitplanemask
		lxi h, (19*256) + (7*8)
		call term_gotoxy		
		mvi c,3
		call term_setcolor
		lxi h, hello23
		call term_puts
		lxi h, (19*256) + (6*8)
		call term_gotoxy		
		mvi c,3*4
		call term_setcolor
		lxi h, hello23
		call term_puts
		jmp $

lup2:
		lda char
		inr a
		jnz $+5
		mvi a, 0 ;' '
		sta char
        
		mov c, a
		call term_putchar
		jmp lup2

char:	.db 0 ; '!'
hello:	.db " Hello world! Хелло вродл! ", 0
hello14:	.db " Hello bitplane 1+4 (red / light green / cyan) ", 0
hello23:	.db " Hello bitplane 2+3 (green / light red / magenta) ", 0
        
msg_nextpal:	.db "БЛК+СБР (F12) - Следующая палитра", 0
        
stop_benchmark:        
		di \ hlt


chartbl:
		; gotoxy 0, 16
		lxi h, (3*256) + (30*8)
		call term_gotoxy
		mvi c, $0b
		call term_setcolor
		call print_hex_row
        
		mvi c, $1
		call term_setcolor

		mvi c, 0
		lxi h, (0*256) + (29*8)
		jmp chartbl_nextrow
        
chartbl_L1:
		push h
		push b
		call term_putchar
		mvi c, ' '
		call term_putchar
		mvi c, ' '
		call term_putchar
		pop b
		inr c
		jz chartbl_L2
		mvi a, $f
		ana c
		pop h
		jnz chartbl_L1
chartbl_nextrow:
		mvi h, 0 
		mvi a, -8
		add l \ mov l, a
		call term_gotoxy
		push h
		push b
		push b
		mvi c, $b
		call term_setcolor
		pop b
		push b
		mov a, c
		call printhex8
		mvi c, $1
		call term_setcolor
		pop b
		mvi c, ' '
		call term_putchar
		pop b
		pop h
		jmp chartbl_L1
chartbl_L2:
		pop psw
		ret

print_hex_row:
		mvi c, 0
print_hex_row_L1:
		push b
		call printhex8
		mvi c, ' '
		call term_putchar
		pop b
		inr c
		mvi a, 16
		cmp c
		jnz print_hex_row_L1
		ret

printhex8:
		call tohex
		push d
		mov c, d
		call term_putchar
		pop d
		mov c, e
		jmp term_putchar

		; in: c = $3E
		; out: d = '3', e='E'
tohex:  
		mov b, c
		mvi a, $f
		ana c
		call tohex_one
		mov e, a
		mov a, b
		rrc \ rrc \ rrc \ rrc
		ani $f
		call tohex_one
		mov d, a
		ret
tohex_one:
		adi '0'
		cpi '9'+1
		rm
		;rz
		adi 7
		ret
        

		;a=маска доступа к плоскостям (0-3, (маска доступа к плоскостям E0-FF,80-9F)+(маска доступа к плоскостям С0-DF,A0-BF)*2 )
term_setbitplanemask:
		rrc
		lxi h,NoSkipBitplane1
		jc $+6
		lxi h,SkipBitplane1
		shld SetSkipBitplane1+1
		rrc
		mvi a,0		;nop
		jc $+5
		mvi a,0C9h	;ret
		sta SetSkipBitplane2
		ret        
        
        
		;c=цвет (0-15, цвет изображения + цвет фона*4)
term_setcolor:
		mvi a,101b
		ana c
		call term_setcolorChk
		shld SetOp1+1
		mvi a,1010b
		ana c
		rrc
		call term_setcolorChk
		shld SetOp2+1
		ret        

term_setcolorChk:
		lxi h,003Eh			;mvi a,00
		rz					;x0x0
		mvi h,0FFh			;mvi a,0FFh
		rpe					;x1x1
		rrc
		lxi h,0000h
		rc					;x0x1
		mvi l,2Fh			;cma
		ret					;x1x0

term_xy	.db 256-8, 0
        
		; переставить курсор
		; h = столбец 0..79
		; l = строка*8 (верх экрана = 256-8)
term_gotoxy:
		shld term_xy
		ret
        
        ; hl = str
term_puts:
		xra a
		ora m
		rz
		mov c,a
		inx h
		push h
		call term_putchar
		pop h
		jmp term_puts

		; пучар + сдвиг позиции курсора
		; код символа в c
term_putchar:
		lxi h, term_xy
		mov e, m
		inx h
		mov d, m
		call putcharv

term_advance:
		lxi h, term_xy + 1
		mov a, m
		inr m
		cpi 80
		rnz
		mvi m, 0
		; advance line
		dcx h
		mvi a, -8
		add m
		mov m, a
		ret

MaskTable:
		.db 10000000b
		.db 01000000b
		.db 00100000b
		.db 00010000b
		.db 00001000b
		.db 00000100b
		.db 00000010b
		.db 00000001b

		; медленный вертикальный пучар из шрифта на боку
		; de = адрес на экране
		; c = код символа
putcharv:
		; смещение на глиф: код * 6
		mvi b, 0
		mov h,b
		mov l,c
		dad h
		dad b
		dad h   
		lxi b, fontsrc
		dad b   ; hl = &fontsrc[c * 6]
        
		; найти адрес столбеца: d * 3 / 8
		mov a, d
		add d
		add d
		mov c, a ; пригодится d * 3
		rar\ rar\ rar\ ori 0E0h
		mov d, a ; d = column * 3 / 8
        
		; первый бит в столбце = $80 >> (d * 3 % 8)
		mvi a, 7
		ana c
		adi MaskTable&255
		mov c, a
		aci MaskTable>>8
		sub c
		mov b, a
		ldax b

		push psw
		push h
		push d
SetSkipBitplane1:
		jmp NoSkipBitplane1
NoSkipBitplane1:
		sta SetA1+1
		mvi a,-96
		sta BitplaneAdd+1
		shld SetHL1+1
SetOp1:
		lxi h,0
		shld Op
		shld Op_
SetA1:
		mvi a,0
SetHL1:
		lxi h,0
		call kapec
		call kapec
		call kapec
SkipBitplane1:
		pop d
		mvi a,-32\ add d\ mov d,a
SetOp2:
		lxi h,0
		shld Op
		shld Op_
		pop h
		mvi a,-32
		sta BitplaneAdd+1
		pop psw
SetSkipBitplane2:
		nop
		call kapec
		call kapec
;проваливаемся в последний раз

kapec:
		mov c,a
		cma
		mov b,a
		mov a,m
		inx h
		push h
	
		mov l,m
Op:
		nop\ nop
		mov h,a
		mov a,l
Op_:
		nop\ nop
		mov l,a
	
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ inr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ inr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ inr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ inr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ inr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ inr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ inr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d
        
		; следующий столбец
		; сдвиг 1: меняем плоскость, битовый столбик тот же самый
		mov l,d
BitplaneAdd:
		mvi a, -64 \ add d \ mov d, a
        
		; 1: капец х 8
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ dcr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ dcr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ dcr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ dcr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ dcr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ dcr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d\ dcr e
		ldax d\ ana b\ dad h\ jnc $+4\ ora c\ stax d

		; сдвиг 2: в плоскость 80h или A0h, следующий битовый столбик
		mov d,h
		pop h
		inx h
		mov a,c \ rrc
		rnc
		; следующий адресный столбец
		inr d
		ret


		; Область временного хранения SP
__savedsp	.dw 0

		; Очистка всей экранной области
clrscr
		di
		lxi h,0
		dad sp
		shld __savedsp

		lxi sp, 0
		lxi b, 0;$ffff
		lxi d, $1000
_clrscr_1:
		push b
		push b
		push b
		push b
		dcx d
		mov a, d
		ora e
		jnz _clrscr_1

		lhld __savedsp
		sphl
		ret

BLACK	.equ 000q
WHITE	.equ 377q
RED		.equ 007q
GREEN	.equ 070q
BLUE	.equ 300q
CYAN	.equ 370q
MAGENTA	.equ 307q

LTGREEN	.equ 172q
LTRED	.equ 127q
YELLOW	.equ 177q

; BK
RGB_C0	.equ BLACK
RGB_C1	.equ RED
RGB_C2	.equ GREEN
RGB_C3	.equ BLUE

; CGA1
CGA1_C0	.equ BLACK
CGA1_C1	.equ CYAN
CGA1_C2	.equ MAGENTA
CGA1_C3	.equ WHITE

; CGA0
CGA0_C0	.equ BLACK
CGA0_C1	.equ LTGREEN
CGA0_C2	.equ LTRED
CGA0_C3	.equ YELLOW


palette_ptr	.dw palette_tbl
palette_tbl	.dw palette_rgb+15, palette_cga0+15, palette_cga1+15, 0

palette  
palette_rgb
		.db RGB_C0                  ; 0 = все нули: бордюр и когда все плоскости в 0
		.db RGB_C1                  
		.db RGB_C2                  
		.db RGB_C3
        
		.db RGB_C2
		.db 0
		.db 0
		.db 0
        
		.db RGB_C1
		.db 0
		.db 0
		.db 0

		.db RGB_C3
		.db 0
		.db 0
		.db 0
		
palette_cga0
		.db CGA0_C0,CGA0_C1,CGA0_C2,CGA0_C3,CGA0_C2,0,0,0,CGA0_C1,0,0,0,CGA0_C3,0,0,0
palette_cga1
		.db CGA1_C0,CGA1_C1,CGA1_C2,CGA1_C3,CGA1_C2,0,0,0,CGA1_C1,0,0,0,CGA1_C3,0,0,0

          ; h points to palette + 15
colorset:
		mvi	a, 88h
		out	0
		ei\ hlt
		mvi	c, 15
colorset1:
		mov	a, c
		out 2
		mov	a, m
		out	0Ch
		xthl
		xthl
		dcx	h
		dcr	c
		out	0Ch
		jp	colorset1

		; включить режим 512 точек
		mvi a, $10
		out 2
		; сбросить прокрутку
		mvi a, 255
		out 3
		ret

fontsrc:
		.db  $00,$00,$00,$00,$00,$00,$00,$3e,$55,$51,$55,$3e,$00,$3e,$6b,$6f,$6b,$3e,$00,$1c,$3e,$7c,$3e,$1c,$00,$18,$3c,$7e,$3c,$18,$00,$30
		.db  $36,$7f,$36,$30,$00,$18,$5c,$7e,$5c,$18,$00,$00,$18,$18,$00,$00,$ff,$ff,$e7,$e7,$ff,$ff,$00,$3c,$24,$24,$3c,$00,$ff,$c3,$db,$db
		.db  $c3,$ff,$00,$30,$48,$4a,$36,$0e,$00,$06,$29,$79,$29,$06,$00,$60,$70,$3f,$02,$04,$00,$60,$7e,$0a,$35,$3f,$00,$2a,$1c,$36,$1c,$2a
		.db  $00,$00,$7f,$3e,$1c,$08,$00,$08,$1c,$3e,$7f,$00,$00,$14,$36,$7f,$36,$14,$00,$00,$5f,$00,$5f,$00,$00,$06,$09,$7f,$01,$7f,$00,$22
		.db  $4d,$55,$59,$22,$00,$60,$60,$60,$60,$00,$00,$14,$b6,$ff,$b6,$14,$00,$04,$06,$7f,$06,$04,$00,$10,$30,$7f,$30,$10,$00,$08,$08,$3e
		.db  $1c,$08,$00,$08,$1c,$3e,$08,$08,$00,$78,$40,$40,$40,$40,$00,$08,$3e,$08,$3e,$08,$00,$30,$3c,$3f,$3c,$30,$00,$03,$0f,$3f,$0f,$03
		.db  $00,$00,$00,$00,$00,$00,$00,$00,$00,$5f,$00,$00,$00,$00,$03,$00,$03,$00,$00,$14,$7f,$14,$7f,$14,$00,$24,$2a,$7f,$2a,$12,$00,$63
		.db  $13,$08,$64,$63,$00,$36,$49,$56,$20,$50,$00,$00,$0b,$07,$00,$00,$00,$00,$1c,$22,$41,$00,$00,$00,$41,$22,$1c,$00,$00,$14,$08,$3e
		.db  $08,$14,$00,$08,$08,$3e,$08,$08,$00,$00,$b0,$70,$00,$00,$00,$08,$08,$08,$08,$08,$00,$00,$60,$60,$00,$00,$00,$60,$10,$08,$04,$03
		.db  $00,$3e,$51,$49,$45,$3e,$00,$00,$42,$7f,$40,$00,$00,$62,$51,$49,$49,$46,$00,$21,$41,$45,$4b,$31,$00,$18,$14,$12,$7f,$10,$00,$27
		.db  $45,$45,$45,$39,$00,$3c,$4a,$49,$49,$30,$00,$01,$71,$09,$05,$03,$00,$36,$49,$49,$49,$36,$00,$06,$49,$49,$29,$1e,$00,$00,$6c,$6c
		.db  $00,$00,$00,$00,$ac,$6c,$00,$00,$00,$08,$14,$22,$41,$00,$00,$14,$14,$14,$14,$14,$00,$00,$41,$22,$14,$08,$00,$02,$01,$51,$09,$06
		.db  $00,$3e,$41,$5d,$55,$1e,$00,$7e,$11,$11,$11,$7e,$00,$7f,$49,$49,$49,$36,$00,$3e,$41,$41,$41,$22,$00,$7f,$41,$41,$22,$1c,$00,$7f
		.db  $49,$49,$49,$41,$00,$7f,$09,$09,$09,$01,$00,$3e,$41,$49,$49,$7a,$00,$7f,$08,$08,$08,$7f,$00,$00,$41,$7f,$41,$00,$00,$30,$40,$40
		.db  $40,$3f,$00,$7f,$08,$14,$22,$41,$00,$7f,$40,$40,$40,$40,$00,$7f,$02,$04,$02,$7f,$00,$7f,$02,$04,$08,$7f,$00,$3e,$41,$41,$41,$3e
		.db  $00,$7f,$09,$09,$09,$06,$00,$3e,$41,$51,$21,$5e,$00,$7f,$09,$09,$19,$66,$00,$26,$49,$49,$49,$32,$00,$01,$01,$7f,$01,$01,$00,$3f
		.db  $40,$40,$40,$3f,$00,$1f,$20,$40,$20,$1f,$00,$3f,$40,$3c,$40,$3f,$00,$63,$14,$08,$14,$63,$00,$07,$08,$70,$08,$07,$00,$61,$51,$49
		.db  $45,$43,$00,$00,$7f,$41,$41,$00,$00,$03,$04,$08,$10,$60,$00,$00,$41,$41,$7f,$00,$00,$04,$02,$01,$02,$04,$80,$80,$80,$80,$80,$80
		.db  $00,$00,$01,$02,$04,$00,$00,$20,$54,$54,$54,$78,$00,$7f,$44,$44,$44,$38,$00,$38,$44,$44,$44,$28,$00,$38,$44,$44,$44,$7f,$00,$38
		.db  $54,$54,$54,$18,$00,$08,$7e,$09,$01,$02,$00,$18,$a4,$a4,$a4,$7c,$00,$7f,$08,$04,$04,$78,$00,$00,$44,$7d,$40,$00,$00,$20,$40,$44
		.db  $3d,$00,$00,$7f,$10,$28,$44,$00,$00,$00,$00,$3f,$40,$00,$00,$7c,$04,$78,$04,$78,$00,$7c,$08,$04,$04,$78,$00,$38,$44,$44,$44,$38
		.db  $00,$7c,$14,$14,$14,$08,$00,$08,$14,$14,$18,$7c,$00,$7c,$08,$04,$04,$08,$00,$48,$54,$54,$54,$20,$00,$04,$3f,$44,$40,$20,$00,$3c
		.db  $40,$40,$20,$7c,$00,$1c,$20,$40,$20,$1c,$00,$3c,$60,$3c,$60,$3c,$00,$44,$28,$10,$28,$44,$00,$8c,$50,$20,$10,$0c,$00,$44,$64,$54
		.db  $4c,$44,$00,$08,$3e,$41,$41,$00,$00,$00,$00,$7f,$00,$00,$00,$00,$41,$41,$3e,$08,$00,$02,$01,$02,$01,$00,$00,$3c,$26,$23,$26,$3c
		.db  $44,$11,$44,$11,$44,$11,$aa,$55,$aa,$55,$aa,$55,$bb,$ee,$bb,$ee,$bb,$ee,$00,$00,$00,$ff,$00,$00,$08,$08,$08,$ff,$00,$00,$0a,$0a
		.db  $0a,$ff,$00,$00,$08,$ff,$00,$ff,$00,$00,$08,$f8,$08,$f8,$00,$00,$0a,$0a,$0a,$fe,$00,$00,$0a,$fb,$00,$ff,$00,$00,$00,$ff,$00,$ff
		.db  $00,$00,$0a,$fa,$02,$fe,$00,$00,$0a,$0b,$08,$0f,$00,$00,$08,$0f,$08,$0f,$00,$00,$0a,$0a,$0a,$0f,$00,$00,$08,$08,$08,$f8,$00,$00
		.db  $00,$00,$00,$0f,$08,$08,$08,$08,$08,$0f,$08,$08,$08,$08,$08,$f8,$08,$08,$00,$00,$00,$ff,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08
		.db  $08,$ff,$08,$08,$00,$00,$00,$ff,$0a,$0a,$00,$ff,$00,$ff,$08,$08,$00,$0f,$08,$0b,$0a,$0a,$00,$fe,$02,$fa,$0a,$0a,$0a,$0b,$08,$0b
		.db  $0a,$0a,$0a,$fa,$02,$fa,$0a,$0a,$00,$ff,$00,$fb,$0a,$0a,$0a,$0a,$0a,$0a,$0a,$0a,$0a,$fb,$00,$fb,$0a,$0a,$0a,$0a,$0a,$0b,$0a,$0a
		.db  $08,$0f,$08,$0f,$08,$08,$0a,$0a,$0a,$fa,$0a,$0a,$08,$f8,$08,$f8,$08,$08,$00,$0f,$08,$0f,$08,$08,$00,$00,$00,$0f,$0a,$0a,$00,$00
		.db  $00,$fe,$0a,$0a,$00,$f8,$08,$f8,$08,$08,$08,$ff,$00,$ff,$08,$08,$00,$7c,$55,$54,$55,$44,$08,$08,$08,$0f,$00,$00,$00,$00,$00,$f8
		.db  $08,$08,$ff,$ff,$ff,$ff,$ff,$ff,$f0,$f0,$f0,$f0,$f0,$f0,$ff,$ff,$ff,$00,$00,$00,$00,$00,$00,$ff,$ff,$ff,$0f,$0f,$0f,$0f,$0f,$0f
		.db  $00,$00,$04,$0a,$04,$00,$00,$00,$24,$2e,$24,$00,$00,$00,$00,$7e,$00,$00,$00,$00,$00,$7a,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
		.db  $00,$00,$00,$00,$00,$06,$0f,$7f,$01,$7f,$00,$00,$00,$08,$00,$00,$00,$38,$55,$54,$55,$18,$00,$00,$24,$2a,$24,$00,$00,$00,$00,$00
		.db  $00,$00,$00,$28,$10,$00,$28,$10,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$02,$78,$02,$00
		.db  $00,$7e,$11,$11,$11,$7e,$00,$7f,$45,$45,$45,$39,$00,$7f,$49,$49,$49,$36,$00,$7f,$01,$01,$01,$03,$00,$c0,$7e,$41,$7f,$c0,$00,$7f
		.db  $49,$49,$49,$41,$00,$77,$08,$7f,$08,$77,$00,$22,$41,$49,$49,$36,$00,$7f,$10,$08,$04,$7f,$00,$7f,$20,$13,$08,$7f,$00,$7f,$08,$14
		.db  $22,$41,$00,$40,$3e,$01,$01,$7f,$00,$7f,$02,$04,$02,$7f,$00,$7f,$08,$08,$08,$7f,$00,$3e,$41,$41,$41,$3e,$00,$7f,$01,$01,$01,$7f
		.db  $00,$7f,$09,$09,$09,$06,$00,$3e,$41,$41,$41,$22,$00,$01,$01,$7f,$01,$01,$00,$27,$48,$48,$48,$3f,$00,$1c,$22,$7f,$22,$1c,$00,$63
		.db  $14,$08,$14,$63,$00,$7f,$40,$40,$7f,$c0,$00,$07,$08,$08,$08,$7f,$00,$7f,$40,$7f,$40,$7f,$00,$7f,$40,$7f,$40,$ff,$00,$01,$7f,$48
		.db  $48,$30,$00,$7f,$48,$30,$00,$7f,$00,$7f,$48,$48,$48,$30,$00,$22,$49,$49,$49,$3e,$00,$7f,$08,$3e,$41,$3e,$00,$46,$29,$19,$09,$7f
		.db  $00,$20,$54,$54,$54,$78,$00,$3c,$4a,$4a,$49,$30,$00,$7c,$54,$54,$54,$28,$00,$7c,$04,$04,$04,$0c,$00,$c0,$78,$44,$7c,$c0,$00,$38
		.db  $54,$54,$54,$18,$00,$6c,$10,$7c,$10,$6c,$00,$28,$44,$54,$54,$28,$00,$7c,$20,$10,$08,$7c,$00,$7c,$21,$12,$09,$7c,$00,$7c,$10,$28
		.db  $44,$00,$00,$40,$38,$04,$04,$7c,$00,$7c,$08,$10,$08,$7c,$00,$7c,$10,$10,$10,$7c,$00,$38,$44,$44,$44,$38,$00,$7c,$04,$04,$04,$7c
		.db  $00,$7c,$14,$14,$14,$08,$00,$38,$44,$44,$44,$28,$00,$04,$04,$7c,$04,$04,$00,$0c,$50,$50,$50,$3c,$00,$10,$28,$7c,$28,$10,$00,$44
		.db  $28,$10,$28,$44,$00,$7c,$40,$40,$7c,$c0,$00,$0c,$10,$10,$10,$7c,$00,$7c,$40,$7c,$40,$7c,$00,$7c,$40,$7c,$40,$fc,$00,$04,$7c,$50
		.db  $50,$20,$00,$7c,$50,$20,$00,$7c,$00,$7c,$50,$50,$50,$20,$00,$44,$54,$54,$54,$38,$00,$7c,$10,$38,$44,$38,$00,$08,$54,$34,$14,$7c
        
		.end
