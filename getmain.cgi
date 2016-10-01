#!/usr/bin/python

import cgi
import cgitb
import os
import tempfile

#cgitb.enable()

fb = open('/tmp/bdsm/MAIN.COM', 'r+b')
content = fb.read()

print "Content-Type: application/octet-stream"
print "Content-Disposition: attachment; filename=main.com"
print "Content-Length: %d"%len(content)
print 
print content
fb.close()

