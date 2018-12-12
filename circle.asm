                ; 🐟 рисования окружности по алгоритму Мичнера
                ; Иван Городецкий 28.11.2018-01.12.2018
                .project circle.rom
Xcorr	        .equ 300h
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

		lxi b,208
		lxi d,Xcorr
GenXcorr:
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
		xchg
		mov a,e
		add a
		jnc $+4
		inr d
		mov m,d
		xchg
		inr e
		jnz GenXcorr

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

		lxi h,8080h	;H=xc, L=yc
		mvi a,127	;радиус
loop:		
		push psw
		push h
		call circle
		pop h
		pop psw
		sui 3
		jp loop

		jmp $

circle:
		shld ycxc+1
		mov b,a
		mov l,a
		mvi h,0
		dad h	;2*R
		mov a,l
		cma
		mov l,a
		mov a,h
		cma
		mov h,a
		inx h	;HL=-2*R
		lxi d,3
		dad d	;HL=3-2*R
		mvi c,0FFh
circle_loop:
		inr c
		mov a,b
		cmp c
		rc
		push h
		push b
		mov l,c
		mvi h,Xcorr>>8
		mov c,m
ycxc:		
		lxi d,0
;xc+x, yc+y
		mov l,b
		mov h,c
		dad d
		call setpixel_xy
;xc+x, yc-y
		mov a,e
		sub b
		mov l,a
		call SetPixelMaskAdr_xy

;xc-x, yc-y
		mov a,d
		sub c
		mov h,a
		call setpixel_xy
;xc-x, yc+y
		mov a,e
		add b
		mov l,a
		call SetPixelMaskAdr_xy

		pop b
		push b
		mov l,b
		mvi h,Xcorr>>8
		mov b,m
;xc+y, yc+x
		mov l,c
		mov h,b
		dad d
		call setpixel_xy
;xc+y, yc-x
		mov a,e
		sub c
		mov l,a
		call SetPixelMaskAdr_xy

;xc-y, yc-x
		mov a,d
		sub b
		mov h,a
		call setpixel_xy
;xc-y, yc+x
		mov a,e
		add c
		mov l,a
		call SetPixelMaskAdr_xy
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
		
	
