		; 🐟 рисования линии алгоритмом Брезенхема в режиме 256х256
		; Тест и бенчмарк
		; 
		; Для запуска бенчмарка нажать УС / СС / РУСЛАТ
		;
		; Точка входа процедуры рисования: 
		; 	line
		; Входные параметры:
		; 	line_x0, line_y0, line_x1, line_y1
		; Рисование происходит в плоскости 0x8000
		; Во время основного цикла прерывания запрещены
		;
		; Вячеслав Славинский и Иван Городецкий, 2017
		;
		.binfile line5.rom 
		.nodump
		.org 100h

		rrc
		rlc
		di
		jmp 	start
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

; ---
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


Restart:
		call	Cls


		lxi h,circl
circloop:
		push h
		lxi h,8080h
		shld line_x0
		pop h
		mov a,m
		ora a
		jz benchmark
		sta line_x1
		inx h
		mov a,m
		sta line_y1
		inx h
		push h
		call line
		pop h
		jmp circloop

circl:
		.db 228,128
		.db 220,166
		.db 199,199
		.db 166,220
		.db 128,228
		.db 90,220
		.db 57,199
		.db 36,166
		.db 28,128
		.db 36,90
		.db 57,57
		.db 90,36
		.db 128,28
		.db 166,36
		.db 199,57
		.db 220,90
		.db 0

benchmark
		in 1
		rlc
		jnc benchmark_go
		rlc
		jnc benchmark_go
		rlc
		jc benchmark

benchmark_go

		;call line
		;jmp $
		call rnd16
		shld line_tail
foreva:
		lhld line_tail
		shld line_x0

		call rnd16
		mov d, h
		mov e, l
		inx d
		mov a, d
		ora e
		jz foreva_nomoar
		shld line_x1
		shld line_tail

		call line
		jmp foreva
foreva_nomoar
		jmp Restart

line_tail:	.dw 0

		; аргументы line()
line_x0		.db 100
line_y0		.db 55
line_x1		.db 0
line_y1		.db 50 

		; эти четыре байта должны идти в таком порядке, а то
line_y		.db 0
line_x		.db 0
line_dx 	.db 0
line_dy		.db 0


line:		; вычислить line_dx, line_dy и приращение Y
		; line_dx >= 0, line_dy >= 0, line1_mod_yinc ? [-1,1]
		call line_calc_dx 
		call line_calc_dy

		; проверяем крутизну склона:
		; dy >= 0, dx >= 0
		;  	dy < dx 	?	пологий
		;	dy >= dx 	?	крутой
		lhld line_dx 	; l = dx, h = dy
		mov a, l 
		cmp h
		jnc  line_gentle
		
		; меняем местами x0 и y0
		lhld line_x0 		;  l = x, h = y
		mov d, l 	 	;  d = y
		mov e, h 	 	;  e = x
		xchg		 	;  l = y, h = x
		shld line_x0

		; меняем местами x1 и y1
		lhld line_x1 		;  l = x, h = y
		mov d, l 		;  d = y
		mov e, h 		;  e = x
		xchg			;  l = y, h = x
		shld line_x1
		; крутой склон: переводим стрелку на цикл S
		mvi a,0C3h		; jmp
		.db 21h			; lxi h, - пропускаем переключение на line_gentle
line_gentle:
		; склон пологий: стрелка на цикле G
		mvi a,021h		; lxi h,
		sta line1_switch
		; если теперь получилось так, что x0 > x1,
		; надо изменить направление рисования линии
		lda line_x0
		mov b, a
		lda line_x1
		cmp b
		jnc line_ltr 	; x0 > x1, не надо переворачивать 

		; поменять концы линии местами
		lhld line_x0
		xchg 
		lhld line_x1
		shld line_x0
		xchg
		shld line_x1

line_ltr:	; пересчитать dx, dy
 		; приращения, 
		; начальные координаты
		; потому что мы поменяли местами X и Y
		call line_calc_dx
		call line_calc_dy

line1:		; линия без длины, нечего и рисовать
		lda line_dx
		ora a
		rz

		; начальное значение D (работает в BC)
		; D = 2 * dy - dx
		cma
		mov e,a
		mvi d,0FFh
		inx d				; de = -line_dx
		push d

		lda line_dy
		mov l, a
		mvi h,0
		dad h
		shld line1_mod_dy+1		; сохранить 2*dy константой

		dad d				; D = 2 * dy - dx
		xthl				; hl = -line_dx
		
		dad h
		xchg				; de = -2*dx
		lhld line1_mod_dy+1	        ; hl = 2*dy
		dad d 				; hl = 2 * dy - 2 * dx
		shld line1_mod_dydx_s+1		; сохранить как конст
		shld line1_mod_dydx_g+1		; сохранить как конст
		pop d
		

		; основной цикл рисования линии
		; цикл раздвоен: одна версия для пологого склона (_g)
		; вторая для крутого склона (_s)
		; переключаются они при оценке крутизны записью 
		; адреса в line1_switch
		; -----------------------------		
		lhld line_x
		mov c,l	;line_x
		mov b,h	;line_dx

		; на время основного цикла прерывания запрещены,
		; чтобы хранить значение 2*dy в SP
		di
		lxi h, 0
		dad sp
		shld line1_finish+1 	; сохранить указатель стека для возврата
line1_mod_dy 	lxi sp, 0ffffh 		; изменяемый код (2*dy)

		; переход внутрь тела цикла
line1_switch	jmp line1_enter_s	; изменяемый код (пологий/крутой)

line1_enter_g
		lda line_y
		sta line_y_g+1
		; подготовить начальное значение регистра c
		mvi a, 111b 		; сначала вычисляем смещение 
		ana c 			; пикселя в PixelMask (с = x)
		mov l,a
		xra c
		rrc
		rrc
		stc
		rar
		mov c,a 		; c = 0x80 | (x >> 3), l = y
		mvi h,PixelMask>>8
		mov a,m
		sta bit_set_g+1

		jmp line1_loop_g


		;------ пологий цикл (g/gentle) -----
line1_then_g:
line1_mod_dydx_g:		
		lxi h, 0ffffh 		; изменяемый код: 2*(dy-dx)
		dad d 			; D = D + 2*(dy-dx)
		xchg
		lxi h, line_y_g+1	; hl = &line_y
line1_mod_yinc_g:
		inr m			; изменяемый код: line_y += yinc
		
		lda bit_set_g+1 	; one-hot бит пикселя
		rrc 			; сдвинуть вправо (следующий X)
		sta bit_set_g+1 	; сохранить
		jnc $+4 		; если провернулся через край
		inr c 			; увеличить адрес колонки

		dcr b			; dx -= 1
		jz line1_finish
line1_loop_g:	; <--- точка входа в пологий цикл --->
		
line_y_g	mvi l, 0ffh 		; изменяемый код: координата y
		mov h, c 		; hl указывают в экран
		xra m 			; a = память с пикселем
		mov m,a 		; записать в память

		; if D > 0
		xra a
		ora d
		jp line1_then_g
line1_else_g: 	; else от if D > 0
		xchg
		dad sp 			; D = D + 2*dy
		xchg

bit_set_g:
		mvi a,80h 		; one-hot бит пикселя
		rrc 			; сдвинуть вправо (следующий X)
		sta bit_set_g+1  
		jnc $+4 		; если провернулся через край
		inr c 			; увеличить адрес колонки

		dcr b			; dx -= 1
		jnz line1_loop_g
		; --- конец тела пологого цикла ---
line1_finish	lxi sp, 0ffffh
		ei
		ret

line1_enter_s
		mov a,c
		sta set_y_s+1 		;y
		lda line_y
		mov c,a	 		;x
		
		ani 111b 		; вычислить начальное значение
		mov l,a 		; адреса колонки ...
		xra c
		rrc
		rrc 
		stc 
		rar 
		sta line_x_s+1 		; 0x8000 | (a / 8)
		mvi h,PixelMask>>8 	; и one-hot бита, соотвествующего
		mov a,m 		; текущему пикселю
		sta bit_set_s+1
set_y_s:		
		mvi c,0
		
		jmp line1_loop_s

		;------ крутой цикл (s/steep) -----
line1_then_s:
line1_mod_dydx_s:		
		lxi h, 0ffffh 		; изменяемый код: 2*(dy-dx)
		dad d 			; D = D + 2*(dy-dx)
		xchg
		inr c			; y = y + 1
		lda bit_set_s+1		; one-hot бит пикселя
line1_mod_xinc_s1:
		rrc 			; изменяемый код: xincLo
		sta bit_set_s+1 
		jnc $+7
		lxi h, line_x_s+1
line1_mod_xinc_s2:
		inr m			; изменяемый код: xincHi
		
		dcr b			; dx -= 1
		jz line1_finish
line1_loop_s:	; <--- точка входа в крутой цикл --->

line_x_s:
		mvi h, 80h		; изменяемый код: координата x
		mov l,c			; координата y
		xra m 			; a = память с пикселем
		mov m,a 		; записать в память

		; if D > 0
		xra a
		ora d
		jp line1_then_s
line1_else_s: 	; else от if D > 0
		xchg
		dad sp 			; D = D + 2*dy
		xchg 			; de = D, hl = 
		inr c			; y = y + 1
		dcr b			; dx -= 1
bit_set_s:
		mvi a,80h 		; one-hot бит пикселя
		jnz line1_loop_s
		; --- конец тела крутого цикла ---
		jmp line1_finish
		; --- конец line() ---
		

		; вычисление расстояния по X (x0 <= x1)
line_calc_dx:
		; проверить, что x0 <= x1
		lda line_x0
		mov b, a
		lda line_x1
		cmp b
		jnc line_x_positive

		lda line_x0
		sta line_x
		lda line_x1
		mov b, a
		lda line_x0
		sub b
		sta line_dx		
		ret
line_x_positive:
		; dx = x1 - x0
		lda line_x0
		sta line_x
		mov b, a
		lda line_x1
		sub b 			; a = x1 - x0
		sta line_dx
		ret

		; вычисление расстояния по Y (y0 <= y1)
line_calc_dy:
		; если y0 <= y1
		lda line_y0
		mov b, a
		lda line_y1
		cmp b
		jnc line_y_positive

		; приращение y = -1
		mvi a, 035h 		; DCR M
		sta line1_mod_yinc_g
		sta line1_mod_xinc_s2
		mvi a, 007h 		; rlc
		sta line1_mod_xinc_s1

		lda line_y0
		sta line_y
		lda line_y1
		mov b, a
		lda line_y0
		sub b
		sta line_dy		
		ret
line_y_positive:
		mvi a, 034h 		; INR M
		sta line1_mod_yinc_g
		sta line1_mod_xinc_s2
		mvi a, 00Fh 		; rrc
		sta line1_mod_xinc_s1
		
		lda line_y0
		sta line_y
		mov b, a
		lda line_y1
		sub b
		sta line_dy
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

colors:
;		.db 0,0,0,0,0,0,0,0
		.db 00000000b,00001001b,00010010b,00011011b,00100100b,00101101b,00110110b,00111111b
		.db 11111111b,00001001b,00010010b,00011011b,00100100b,00101101b,00110110b,00111111b

		.end