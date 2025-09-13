; this file can be included using .include directive
#ifdef USE_DB64
        .db64 TG9uZyBiaW5hcnkgaW5pdGlhbGl6YXRpb24gc2VjdGlvbnMgY2FuIGJlIGRlZmluZWQgdXNpbmcgYmFzZTY0LWVuY29kZWQgc3RyaW5ncyENCiQ=
#else
        .db "Larger data can be encoded using base64, but USE_DB64 wasn't defined", $0d, $0a, '$'
#endif
;
