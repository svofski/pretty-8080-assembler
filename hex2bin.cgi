#!/usr/local/bin/python

import cgi
import cgitb
import os
import tempfile

#cgitb.enable()

form = cgi.FieldStorage()

formBinName = form.getvalue("formbinname")
formHexName = form.getvalue("formhexname")
formDownloadFormat = form.getvalue("downloadformat")

if formDownloadFormat == "hex":
    try:
        pureHex = form.getvalue("hex").replace("|n","\n")
    except:
        print "No hex"

    print "Content-Type: text/plain"
    print "Content-Disposition: attachment; filename="+formHexName
    print "Content-Transfer-Encoding: quoted-printable"
    print 
    print pureHex
else:
    fh=tempfile.NamedTemporaryFile(suffix='.hex')
    hexName = fh.name
    try:
        pureHex = form.getvalue("hex").replace("|n","\n")
        fh.write(pureHex)
        fh.flush()
    except:
        print "No hex"

    binName = '/tmp/tmphex2bin.bin' # fb.name

    cmdline='/usr/bin/objcopy -I ihex ' + hexName + ' -O binary ' + binName


    try:
      os.system(cmdline)
    except:
      print 'boo!'

    fb = open(binName, 'r+b')
    content = fb.read()

    print "Content-Type: application/octet-stream"
    print "Content-Disposition: attachment; filename="+form.getvalue("formbinname")
    print "Content-Length: %d"%len(content)
    print 
    print content
    fh.close()
    fb.close()

