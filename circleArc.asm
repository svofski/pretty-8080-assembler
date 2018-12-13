                ; 🐟 Рисование окружности по алгоритму Мичнера
                ; Иван Городецкий 28.11.2018-02.12.2018
                ; Версия с клиппингом и возможностью рисования эллипсов и дуг
                ;
                ; Пример рисования дуг
                
                .project circlearc.rom

ARcorr	        .equ 400h

		.org 100h

start:
		xra	a
		out	10h
		lxi	sp,100h
		mvi	a,0C3h
		sta	0
		lxi	h,Restart
		shld	1

		call	Cls
		mvi	a,0C9h
		sta	38h
		ei
		hlt
		lxi	h, colors+15
colorset:
		mvi	a, 88h
		out	0
		mvi	c, 15
colorset1:	mov	a, c
		out	2
		mov	a, m
		out	0Ch
		dcx	h
		out	0Ch
		out	0Ch
		dcr	c
		out	0Ch
		out	0Ch
		out	0Ch
		jp	colorset1
		mvi	a,255
		out	3

		jmp Restart
		
		.org 200h
PixelMask:
		.db 10000000b
		.db 01000000b
		.db 00100000b
		.db 00010000b
		.db 00001000b
		.db 00000100b
		.db 00000010b
		.db 00000001b


Restart:
		call	Cls
		
		call IniCircle


		lxi h,08080h	;H=xc, L=yc
		mvi b,127	;радиус
		mvi c,10000000b ; маска дуги
		lxi d,13*256+16	;D=xcorr, E=ycorr
loop:
		push b
		push h
		push d
		call circle
		pop d
		pop h
		pop b
		mvi a, $fc ;  -4
		add b
		mov b,a
		mov a,c
		rrc
		mov c,a
		jnc loop

		jmp $

circle:
		mvi a,15
		ana d
		adi ARcorr>>8
		sta SetXcorr1+1
		sta SetXcorr2+1

		mvi a,15
		ana e
		adi ARcorr>>8
		sta SetYcorr1+1
		sta SetYcorr2+1
		shld ycxc+1

		lxi h,setpixel_xy
		shld SetArc128+1
		shld SetArc64+1
		shld SetArc32+1
		shld SetArc16+1
		shld SetArc8+1
		shld SetArc4+1
		shld SetArc2+1
		shld SetArc1+1
		
		lxi h,setpixel_xy_ret
		mov a,c
		add a
		jc $+6
		shld SetArc128+1
		add a
		jc $+6
		shld SetArc64+1
		add a
		jc $+6
		shld SetArc32+1
		add a
		jc $+6
		shld SetArc16+1
		add a
		jc $+6
		shld SetArc8+1
		add a
		jc $+6
		shld SetArc4+1
		add a
		jc $+6
		shld SetArc2+1
		add a
		jc $+6
		shld SetArc1+1
		
		mov l,b
		mvi h,0
		dad h	;2*R
		mvi a,3
		sub l
		mov l,a
		mvi a,0
		sbb h
		mov h,a	;HL=3-2*R
		mvi c,0FFh
circle_loop:
		inr c
		mov a,b
		cmp c
		rc
		push h
		push b
		mov l,c
SetXcorr1:
		mvi h,ARcorr>>8
		mov c,m
		mov l,b
SetYcorr1:
		mvi h,ARcorr>>8
		mov b,m
ycxc:		
		lxi d,0
;xc+x, yc+y
		mov a,d
		add c
		mov h,a
		cmp d
		jc Clip1
		mov a,e
		add b
		mov l,a
		cmp e
SetArc128:
		cnc setpixel_xy
;xc+x, yc-y
		mov a,e
		sub b
		mov l,a
		dcr a
		cmp e
		jnc Clip1
		mov a,d
		add c
		mov h,a
SetArc16:
		call setpixel_xy

Clip1:
;xc-x, yc-y
		mov a,d
		sub c
		mov h,a
		dcr a
		cmp d
		jnc Clip2
		mov a,e
		sub b
		mov l,a
		dcr a
		cmp e
SetArc8:
		cc setpixel_xy
;xc-x, yc+y
		mov a,e
		add b
		mov l,a
		cmp e
		jc Clip2
		mov a,d
		sub c
		mov h,a
SetArc1:
		call setpixel_xy

Clip2:
		pop b
		push b
		mov l,b
SetXcorr2:
		mvi h,ARcorr>>8
		mov b,m
		mov l,c
SetYcorr2:
		mvi h,ARcorr>>8
		mov c,m
;xc+y, yc+x
		mov a,d
		add b
		mov h,a
		cmp d
		jc Clip3
		mov a,e
		add c
		mov l,a
		cmp e
SetArc64:
		cnc setpixel_xy
;xc+y, yc-x
		mov a,e
		sub c
		mov l,a
		dcr a
		cmp e
		jnc Clip3
		mov a,d
		add b
		mov h,a
SetArc32:
		call setpixel_xy

Clip3:
;xc-y, yc-x
		mov a,d
		sub b
		mov h,a
		dcr a
		cmp d
		jnc Clip4
		mov a,e
		sub c
		mov l,a
		dcr a
		cmp e
SetArc4:
		cc setpixel_xy
;xc-y, yc+x
		mov a,e
		add c
		mov l,a
		cmp e
		jc Clip4
		mov a,d
		sub b
		mov h,a
SetArc2:
		call setpixel_xy
Clip4:
		pop b
		pop d

		xra a
		ora d
		jp DmoreZ
;D<0
		mov l,c
		mvi h,0
		dad h
		dad h
		dad d
		lxi d,6
		dad d
		jmp circle_loop

DmoreZ:
		mov a,c
		sub b
		mov l,a
		mvi h,0FFh
		dad h
		dad h
		dad d
		lxi d,10
		dad d
		dcr b
		jmp circle_loop

; ---
; вход:
; H - X
; L - Y
; адрес пикселя =  base + (x / 8) << 8 + y
; номер пикселя = x % 8
setpixel_xy:
		mvi a, 111b 		; сначала вычисляем смещение 
		ana h 			; пикселя в PixelMask
		sta SetPixelMaskAdr_xy+1
		xra h
		rrc 			; 
		rrc 			; 
		stc 			; 
		rar 			; 
		mov h,a 		; h = 0x8000 | (a >> 3)
SetPixelMaskAdr_xy:
		lda PixelMask
		ora m 			; a = память с пикселем
		mov m,a 		; записать в память
setpixel_xy_ret:
		ret

IniCircle:
		mvi a,15
		sta SetA+1
		lxi b,16
		lxi d,ARcorr+256
GenARcorr:
		mov l,b
		mov h,e
		dad h\ jnc $+4\ dad b
		dad h\ jnc $+4\ dad b
		dad h\ jnc $+4\ dad b
		dad h\ jnc $+4\ dad b
		dad h\ jnc $+4\ dad b
		dad h\ jnc $+4\ dad b
		dad h\ jnc $+4\ dad b
		dad h\ jnc $+4\ dad b
		xra a
		ora l
		jp $+4
		inr h
		xchg
		mov m,d
		xchg
		inr e
		jnz GenARcorr
		mvi a,16
		add c
		mov c,a
		inr d
SetA:
		mvi a,0
		dcr a
		sta SetA+1
		jnz GenARcorr
		
		lxi h,ARcorr
GenARcorr2:
		mov m,l
		inr l
		jnz GenARcorr2
		ret

Cls:
		lxi	h,08000h
		mvi	e,0
		xra	a
ClrScr:
		mov	m,e
		inx	h
		cmp	h
		jnz	ClrScr
		ret

		.end

colors:
		.db 00000000b,00001001b,00010010b,00011011b,00100100b,00101101b,00110110b,00111111b
		.db 11111111b,00001001b,00010010b,00011011b,00100100b,00101101b,00110110b,00111111b
		
	
