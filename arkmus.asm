                ; 🐟  Мелодия из игры Arkanoid на Векторе-06ц без AY
                ; Тонгенератор: Иван Городецкий, Уфа
                ; Мелодия: Вячеслав Славинский, С.-Петербург    
                ; 2019
                ; Оригинальная композиция: 小倉 久佳 Хисайоши Огура
                ;  
                .project arkmus.rom
                .tape v06c-rom
Begin           .equ 100h

                .org Begin

NotesNum        .equ (12*4)+3
                
                in 0
                out 0

Start:
                di
                xra a
                out 10h
                lxi sp,100h
                mvi a,0C3h
                sta 0
                lxi h,Start
                shld 1
                
                mvi a,30h
                out 8
                mvi a,70h
                out 8
                mvi a,1
                out 0Bh
                mvi a,0
                out 0Bh
                mvi a,1
                out 0Ah
                mvi a,0
                out 0Ah

                mvi a,10h
                out 8
                mvi a,50h
                out 8
                mvi a,1
                out 0Bh
                out 0Ah


PlayLoopIni:
                lxi h,Music
                mvi a,0DBh      ;in
                sta SetCh1Vol+2
                sta SetCh2Vol+2

PlayLoop:
                mov a,m         ;громкость 1го канала
                ora a
                jz PlayLoopIni
                cpi -1
                jz Ch1Tie
                sta SetCh1Vol+1
Ch1Tie:         
                inx h
        
                mov a,m
                inx h
                adi Notes&255
                mov e,a
                mvi a,0
                aci Notes>>8
                mov d,a
                ldax d          ;период 1го канала
                mov c,a
                
                mov a,m
                cpi -1
                jz Ch2Tie
                sta SetCh2Vol+1
Ch2Tie:         
                inx h

                mov a,m
                inx h
                adi Notes&255
                mov e,a
                mvi a,0
                aci Notes>>8
                mov d,a
                ldax d          ;период 2го канала
                mov b,a
        
                mov d,m
                inx h
                push h
                call BeepSk
                pop h
                jmp PlayLoop


L1              .equ 36
L2              .equ L1/2
L4              .equ L1/4
L8              .equ L1/8
L16             .equ L1/16
L32             .equ L1/32

BASS_UP         equ 50
BASS_DN         equ 40
LEAD_STRONK
LEAD_SOFT

Music:
                ; Line 1 Bar 1
                db BASS_UP,G2,30,G3,L1
                db BASS_DN,D3,30,A3,L2
                db -1,D3,50,B3-1,L2
                db BASS_UP,G2,30,A3,L1
                db BASS_DN,D3,30,G3,L1

                db BASS_UP,F2,30,A3,L1
                db BASS_DN,C3,50,D4,L1
                db BASS_UP,F2,40,A3,L1
                db BASS_DN,C3,-1,A3,L1

                db BASS_UP,E2-1,40,G3,L1
                db BASS_DN,B2-1,40,A3,L2
                db -1,B2-1,50,B3-1,L2
                db BASS_UP,E2-1,40,A3,L1
                db BASS_DN,B2-1,50,G3,L1
                
                db BASS_UP,D2,-1,G3,L1
                db BASS_DN,A2,40,G3-1,L1
                db BASS_UP,D2,40,G3,L1
                db BASS_DN,A2,40,A3,L1

                ; Line 2
                db BASS_UP,G2,30,G3,L1
                db BASS_DN,D3,30,A3,L2
                db -1,D3,50,B3-1,L2
                db BASS_UP,G2,30,A3,L1
                db BASS_DN,D3,30,G3,L1

                db BASS_UP,F2,30,A3,L1
                db BASS_DN,C3,50,D4,L1
                db BASS_UP,F2,40,A3,L1
                db BASS_DN,C3,-1,A3,L1

                db BASS_UP,E2-1,40,B3-1,L1
                db BASS_DN,B2-1,40,C4,L2
                db -1,B2-1,50,D4,L2
                db BASS_UP,E2-1,40,C4,L1
                db BASS_DN,B2-1,40,B3-1,L1
                
                db BASS_UP,D2,50,c4,L1
                db BASS_DN,A2,50,F4,L1
                db BASS_UP,D2,50,C4,L1
                db BASS_DN,A2,-1,C4,L1

                ; Line 3
                db BASS_UP-10,G2,60,A4,L1
                db BASS_DN-10,D3,-1,A4,L1
                db BASS_UP-10,G2,60,A4,L1
                db BASS_DN,D3,-1,A4,L1

                db BASS_UP,F2,50,A4,L1
                db BASS_DN,C3,-1,A4,L1
                db BASS_UP,F2,50,A4,L2
                db -1,F2,50,G4,L2
                db BASS_DN,C3,50,F4,L2
                db -1,C3,50,C4,L2

                db BASS_UP-5,E2-1,64,D4,L1
                db BASS_DN-5,B2-1,-1,D4,L1
                db BASS_UP-5,E2-1,-1,D4,L1
                db BASS_DN-5,B2-1,-1,D4,L1
                
                db BASS_UP,D2,-1,D4,L1
                db BASS_DN,A2,-1,D4,L1
                db BASS_UP,D2,-1,D4,L1
                db BASS_DN,A2,-1,D4,L1

                ; Line 4
                db BASS_UP-5,G2,60,A4,L1
                db BASS_DN-5,D3,-1,A4,L1
                db BASS_UP-5,G2,60,A4,L1
                db BASS_DN-5,D3,-1,A4,L1

                db BASS_UP,F2,50,A4,L1
                db BASS_DN,C3,-1,A4,L1
                db BASS_UP,F2,50,A4,L2
                db -1,F2,50,G4,L2
                db BASS_DN,C3,50,F4,L2
                db -1,C3,50,C4,L2

                db BASS_UP-5,E2-1,64,D4,L1
                db BASS_DN-5,B2-1,-1,D4,L1
                db BASS_UP-5,E2-1,-1,D4,L1
                db BASS_DN-5,B2-1,-1,D4,L1
                
                db BASS_UP-10,D2,30,D3,L1
                db BASS_DN-8,A2,30,D3-1,L1
                db BASS_UP-6,D2,30,D3,L1
                db BASS_DN-4,A2,30,E3,L1


                db 0

Notes:
                .db                                                                               0,243 ;A#1 B1 0-1
                .db 229,216,204,193,182,172,162,153,144,136,129,122 ;C2 C#2 D2 D#2 E2 F2 F#2 G2 G#2 A2 A#2 B2 2-13
                .db 229/2,216/2,204/2,193/2,182/2,172/2,162/2,153/2,144/2,136/2,129/2,122/2 ;C3 C#3 D3 D#3 E3 F3 F#3 G3 G#3 A3 A#3 B3 14-25
                .db 229/4,216/4,204/4,193/4,182/4,172/4,162/4,153/4,144/4,136/4,129/4,122/4 ;C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 14-25
                .db 229/8,216/8,204/8,193/8,182/8,172/8,162/8,153/8,144/8,136/8,129/8,122/8 ;C5 C#5 D5 D#5 E5 F5 F#5 G5 G#5 A5 A#5 B5 26-37
                
C2              equ 2
Cfis2           equ C2+1
D2              equ Cfis2+1
Dfis2           equ D2+1
E2              equ Dfis2+1
F2              equ E2+1
Fis2            equ F2+1
G2              equ Fis2+1
Gfis2           equ G2+1
A2              equ Gfis2+1
Afis2           equ A2+1
B2              equ Afis2+1

C3              equ 12+C2
Cfis3           equ 12+Cfis2
D3              equ 12+D2
Dfis3           equ 12+Dfis2
E3              equ 12+E2
F3              equ 12+F2
Fis3            equ 12+Fis2
G3              equ 12+G2
Gfis3           equ 12+Gfis2
A3              equ 12+A2
Afis3           equ 12+Afis2
B3              equ 12+B2

C4              equ 24+C2
Cfis4           equ 24+Cfis2
D4              equ 24+D2
Dfis4           equ 24+Dfis2
E4              equ 24+E2
F4              equ 24+F2
Fis4            equ 24+Fis2
G4              equ 24+G2
Gfis4           equ 24+Gfis2
A4              equ 24+A2
Afis4           equ 24+Afis2
B4              equ 24+B2


;D - длительность звучания
BeepSk:
                mvi e,0
                mov h,b
                mov l,c

SetCh1Vol:
                mvi a,0
                ;lxi h
                out 0Bh
SetCh2Vol:
                mvi a,0
                out 0Ah
                dcr l
                jnz Ch2
                lda SetCh1Vol+2
                cpi 0D3h
                mvi a,0D3h      ;out
                jnz $+5
                mvi a,0DBh      ;in
                sta SetCh1Vol+2
                mov l,c
Ch2:
                dcr h
                jnz AfterCh2
                lda SetCh2Vol+2
                cpi 0D3h
                mvi a,0D3h      ;out
                jnz $+5
                mvi a,0DBh      ;in
                sta SetCh2Vol+2
                mov h,b
AfterCh2:
                dcr e
                jnz SetCh1Vol

Release1:       ; затухание ноты первого канала        
                lda SetCh1Vol+1
                dcr a
                jm Release2
                sta SetCh1Vol+1
Release2:       ; затухание ноты второго канала в два раза медленнее
                mov a, d
                ani 1
                jz Released
                lda SetCh2Vol+1
                dcr a
                jm Released
                sta SetCh2Vol+1
Released:
                
                dcr d
                jnz SetCh1Vol
                ret

End:
                .
