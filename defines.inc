#define ALIGN(N) .org ($ + ((N)-1) & ~((N)-1))
