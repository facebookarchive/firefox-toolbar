# Makefile for compiling .xpt files and building the .xpi.
# This requires a Unix-like environment. On Windows, you
# can install cygwin or MozillaBuild (https://wiki.mozilla.org/MozillaBuild)
#
# Usage: optionally set the MOZSDKDIR environment variable pointing to the
# Gecko SDK if you want to rebuild the .xpt files.
# Run "make" to build the .xpi.

sdkdir ?= ${MOZSDKDIR}
ifeq ($(nocompile),)
ifeq ($(sdkdir),)
  nocompile := 1
  warn_nocompile := 1
endif
endif

IDLC=${MOZSDKDIR}/bin/xpidl
INC=${MOZSDKDIR}/idl
XPTS=components/facebook.xpt

all: xpi

xpt: $(XPTS)

components/%.xpt: idl/%.idl
ifneq ($(warn_nocompile),)
	@echo
	@echo "WARNING: the MOZSDKDIR environment variable was not set. .xpt files won't be compiled."
	@echo "    If this is intentional, you should pass the nocompile=1 variable on the command line to skip this warning:"
	@echo "    If you change the idl, set the MOZSDKDIR environment variable to point to the location of the Gecko SDK."
	@echo "    For instance: export MOZSDKDIR=/foo/bar/baz"
endif
ifeq ($(nocompile),)
	$(IDLC) -m typelib -w -v -I $(INC) -e $(@) $(<)
endif

appname := facebook
xpi_name := $(appname).xpi
# Set this to 1, for using a .jar file for chrome files.
# Note that the manifest does not support this yet.
use_chrome_jar := 0
ifeq ($(use_chrome_jar),1)
chrome_files := chrome/$(appname).jar
else
chrome_files := chrome
endif

xpi_files := $(chrome_files) license.txt defaults components \
             install.rdf chrome.manifest

chrome/$(appname).jar:
	rm -f chrome/faceook.jar
	cd chrome; zip -9 -r $(appname).jar * -x \*.svn/*; cd ..

xpi: xpt $(xpi_files)
	rm -f $(xpi_name)
	zip -9 -r $(xpi_name) $(xpi_files) -x \*.svn/*

clean:
	rm -f $(xpi_name) chrome/$(appname).jar

.PHONY: all xpi
