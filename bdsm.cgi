#!/usr/bin/python

debug = False
withmsg = True

import cgi
import cgitb
import os, os.path
import tempfile
import sys
import re
import shutil
import subprocess

LOCKFILE="/var/run/simh/lock"

def lock():
    try:
        if os.access(LOCKFILE, os.F_OK): return 0
    except:
        # file probably doesn't exist, great
        pass

    try:
        f = open(LOCKFILE, "w")
        f.write(str(os.getpid()))
        f.close()
        return 1
    except:
        pass

    return 0
        
def unlock():
    try:
        os.unlink(LOCKFILE)
    except:
        pass

def sprockets(log):
    print '<div id="sprockets">'
    count = len(re.findall("<div|<br", log))
    for i in xrange(count/2):
        print '&nbsp; &#9711; '
    print '</div>'

#cgitb.enable()

sys.path.append("/home/svo/simh")
import bdsm

TEMPDIR=tempfile.gettempdir() + "/bdsm/"
MAINC  = TEMPDIR + "main.c"

if lock():
    try:
        form = cgi.FieldStorage()

        csource=form.getvalue("main.c")

        cflags=""
        ldflags=""
        runargs=None

        processed = ""

        for l in csource.split("\n"):
            if l.find("#pragma") == 0:
                try:
                    parts = l.split()
                    if parts[1] == "cflags":
                        cflags += " ".join(parts[2:])
                    elif parts[1] == "ldflags":
                        ldflags += "".join(parts[2:])
                    elif parts[1] == "run":
                        runargs = " ".join(parts[2:])
                except:
                    pass
            else:
                processed += l

        try:
            os.makedirs(TEMPDIR)
        except OSError, err:
            pass

        mainc = open(MAINC, "w")
        mainc.write(processed)
        mainc.close()

        if debug:
            print "Content-Type: text/plain"
            print 
            print processed
            print 
            print "cflags='%s'" % cflags
            print "ldflags='%s'" % ldflags
            print "---"

        else:
            bargs = [  '',
                       '--sandboxroot=%s' % TEMPDIR, 
                       '--outdir=%s' % TEMPDIR, 
                       '--no-cleanup',
                       '--cflags=%s' % cflags,
                       '--ldflags=%s' % ldflags,
                       '--verbose2'] \
                       + [[],['--runargs=%s' % runargs]][runargs != None] \
                       + [MAINC]

            nerrors,log = bdsm.build(bargs)

            print "Content-Type: text/html"
            if nerrors == 0:
                print "Refresh: 0; url=getmain.cgi"
            print 
            print '<html>'
            print '<head>'
            print '<link href="log.css" rel="stylesheet" type="text/css" media="screen">'
            print '</head><body>'
            print '<div id="header">Session Log</div>'
            sprockets(log)
            print '<div id="page">'
            print log
            print '</div><!-- page -->'
            print '</body></html>'
    except:
        print "Content-Type: text/html"
        print 'Refresh: 0; url=c\n'
        print '<html>'
        print '<head>'
        print '<link href="log.css" rel="stylesheet" type="text/css" media="screen">'
        print '</head><body>'
        print '<div id="header">Bad Request</div>'
        print '</body></html>'

    unlock()
else:
    print "Content-Type: text/html\n"
    print '<html>'
    print '<head>'
    print '<link href="log.css" rel="stylesheet" type="text/css" media="screen">'
    print '</head><body>'
    print '<div id="header">Server Busy</div>'
    print '<div id="page">'
    print '<br>The COMPUTER is your Friend.<br><br>'
    print 'It is being helpful to someone else at the moment.<br>'
    print '<br>Please be patient and try again in a minute.'
    print '</body></html>'


