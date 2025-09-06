		; Быстрое проявление мандрила с использованием LFSR
		; Эту 🐟 сделал Иван Городецкий, 04.10.2017

		.project babdis.rom
		.tape v06c-rom

		.org 100h

		di
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

                ; перенос картинки в экранные плоскости a0, c0, e0
		lxi h,pic
		lxi d,0A000h
MovPic:
		mov a,m     ; загружаем точку картинки
		stax d      ; сохраняем в de
		inx h       ; увеличиваем откуда
		inx d       ; увеличиваем куда
		mov a,d     ; проверяем перевал за адрес $ffff
		ora e
		jnz MovPic

Restart:
		call	Cls
		mvi a,64
		sta counter2+1		
		
loop:
		call rnd16
		call setpixel
		call rnd16
		call setpixel
		call rnd16
		call setpixel
		call rnd16
		call setpixel
counter1:
		mvi a,0
		dcr a
		sta counter1+1
		jnz loop
counter2:
		mvi a,64
		dcr a
		sta counter2+1
		jnz	loop
		lxi h,0
		call setpixel
neverend:
		jmp neverend

Cls:
		lxi	h,08000h
		mvi e,0
		mvi a,0A0h
ClrScr:
		mov	m,e
		inx	h
		cmp	h
		jnz	ClrScr
		ret

; выход:
; HL - число от 1 до 65535
rnd16:
		lxi h,65535
		dad h
		shld rnd16+1
		rnc
		mvi a,00000001b ;перевернул 80h - 10000000b
		xra l
		mov l,a
		mvi a,01101000b	;перевернул 16h - 00010110b
		xra h
		mov h,a
		shld rnd16+1
		ret

; установить пиксель в плоскости $80
; вход:
; H - X
; L - Y
setpixel:
		mov d,h
		mvi a,11111000b
		ana h
		rrc
		rrc
		stc
		rar
		mov h,a
		mvi a,111b
		ana d
		mov e,a
		mvi d,PixelMask>>8
		ldax d
		ora m
		mov m,a
		ret

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

colors:
		.db 0,0,0,0,0,0,0,0
		.db 00000000b,00001001b,00010010b,00011011b,00100100b,00101101b,00110110b,00111111b

                ; 🐒
                .include "baboon-picture.inc"
                .end
