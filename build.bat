name=../facebook_firefox-1.3.xpi
rm -fv $name
zip -r $name chrome chrome.manifest components defaults install.rdf license.txt -x "*.svn*" -x "*.bat" -x "*~" -x "*.kpf";
echo $name;
