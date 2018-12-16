copy /b ..\encodings.js+..\util.js+..\tape.js+stub.js+..\assembler.js+runner.js _all.js
mkdir out
del/q out\*.*
node _all tests/syntaxtest.asm tests/cpm22.asm ../circleArc.asm ../hello-okean240.asm ../hello-rk.asm  ../hello-v06c.asm

diff expected/syntaxtest.lst out/syntaxtest.lst
diff expected/cpm22.lst out/cpm22.lst
diff expected/circleArc.lst out/circleArc.lst
diff expected/hello-okean240.lst out/hello-okean240.lst
diff expected/hello-v06c.lst out/hello-v06c.lst
diff expected/hello-rk.lst out/hello-rk.lst
