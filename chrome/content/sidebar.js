var Cc = Components.classes;
var Ci = Components.interfaces;

const kXULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";       

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var observer = {
    observe: function(subject, topic, data) {
        dump('OBSERVING SOMETHING: ' + topic + '\n');
        var panel = document.getElementById('facebook-panel');
        switch (topic) {
            case 'facebook-session-start':
                LoadFriends();
                break;
        }
    }
};

function LoadFriends() {
    dump('LoadFriends()\n');
    var list = document.getElementById('fList');
    var friends = fbSvc.friendsRdf;
    if (friends) {
        list.database.AddDataSource(friends);
        list.builder.rebuild();
        facebook.searchFriends(top.document.getElementById('facebook-search'));// XXX this doesn't work
    } else {
        dump('no friends\n');
    }
}

function SidebarLoad() {
    dump('SidebarLoad\n');
    top.document.getElementById('facebook-tbbutton').checked = true;
    LoadFriends();
    obsSvc.addObserver(observer, 'facebook-session-start', false);
    // XXX if the toolbar is not present, add a search box to the top of the sidebar, kind of like this:
    // <hbox>
    //   <textbox type="timed" timeout="500" id="facebook-search" oncommand="SidebarType(event)" flex="1"/>
    //   <button id="do-search" oncommand="DoWebSearch(event, this.previousSibling)" label="Search"/>
    // </hbox>
}
function SidebarUnload() {
    dump('SidebarUnload\n');
    top.document.getElementById('facebook-tbbutton').checked = false;
    obsSvc.removeObserver(observer, 'facebook-session-start');
}

function gotoFbUrl(event, page, uid, aMouseClick) {
  loadLink(event, 'http://www.facebook.com/' + page + '?uid=' + uid + '&api_key=' + fbSvc.apiKey, aMouseClick);
}

function loadLink(event, url, aMouseClick) {
  dump('loadLink: ' + url + '\n');
    var browser = top.document.getElementById("content");
    if (aMouseClick) {
        if (event.button == 1) {
            var tab = browser.addTab(url);  
            browser.selectedTab = tab;
            if (event.target.localName == "menuitem") {
                event.target.parentNode.hidePopup();
            }
        } else {
            browser.loadURI(url);
        }
    } else {
        if(!event){
            browser.loadURI(url);
            return;
        }
        var shift = event.shiftKey;     
        var ctrl =  event.ctrlKey;
        var meta =  event.metaKey;
        if (event.button == 1 || ctrl || meta) {    
            var tab = browser.addTab(url);  
            browser.selectedTab = tab;
        } else if(shift) {
            openDialog("chrome://browser/content/browser.xul", "_blank", "chrome,all,dialog=no", url);
        } else {
            browser.loadURI(url);
        }
    }
    return;  
}
