copy /b ..\encodings.js+..\util.js+..\tape.js+stub.js+..\assembler.js+runner.js _all.js
mkdir out
del/q out\*.*
node _all tests/syntaxtest.asm tests/cpm22.asm ../circleArc.asm ../hello-okean240.asm ../hello-rk.asm  ../hello-v06c.asm

diff expected/syntaxtest.html out/syntaxtest.html
diff expected/cpm22.html out/cpm22.html
diff expected/circleArc.html out/circleArc.html
diff expected/hello-okean240.html out/hello-okean240.html
diff expected/hello-v06c.html out/hello-v06c.html
diff expected/hello-rk.html out/hello-rk.html