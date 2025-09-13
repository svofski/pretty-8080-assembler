#define LOG2_4    2
#define LOG2_8    3
#define LOG2_16   4
#define LOG2_32   5
#define LOG2_64   6
#define LOG2_128  7
#define LOG2_256  8

#define LOG2_PASTE(a,b) a##b
#define LOG2_PASTE_EXPAND(a,b) LOG2_PASTE(a,b)
#define LOG2(N) LOG2_PASTE_EXPAND(LOG2_, N)

#define ALIGN(N) .org ($+((N)-1)) & ($ffff & ($ffff << LOG2(N)))
