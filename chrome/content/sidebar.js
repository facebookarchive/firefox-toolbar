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
        SearchFriends(document.getElementById('facebook-search'));
    } else {
        dump('no friends\n');
    }
}

function SidebarLoad() {
    dump('SidebarLoad\n');
    top.document.getElementById('facebook-tbbutton').checked = true;
    LoadFriends();
    obsSvc.addObserver(observer, 'facebook-session-start', false);
}
function SidebarUnload() {
    dump('SidebarUnload\n');
    top.document.getElementById('facebook-tbbutton').checked = false;
    obsSvc.removeObserver(observer, 'facebook-session-start');
}

function SidebarType(event) {
    //waitTil = (new Date()).getTime() + 500;
    //window.setTimeout("SearchFriends(document.getElementById('facebook-search'))", 500);
    SearchFriends(document.getElementById('facebook-search'));
}

//var waitTil=0;
var currentSearch;
function SearchFriends(searchBox) {
    if (!fbSvc.loggedIn) {
        dump('not logged in\n');
        return;
    }
    if (searchBox.value) {
        var search = searchBox.value.toLowerCase();
    }
    if (search == currentSearch) {
        dump('already searched for that\n');
        return;
    }
    currentSearch = search;
    /*
    var now = (new Date()).getTime();
    if (waitTil > now) {
        dump('still waiting\n');
        window.setTimeout("SearchFriends(document.getElementById('facebook-search'))", waitTil - now);
        return;
    }
    */
    if (search) {
        for each (var node in document.getElementById('fList').childNodes) {
            var sname = node.getAttribute('searchname');
            if (sname) {
                var i = sname.indexOf(search);
                if (i == -1 || (i != 0 && sname[i-1] != ' ')) {
                    node.style.display = 'none';
                } else {
                    node.style.display = '';
                }
            }
        }
    } else {
        for each (var node in document.getElementById('fList').childNodes) {
            if (node.style) {
                node.style.display = '';
            }
        }
    }
}

function DoWebSearch(event) {
    loadLink(event, 'http://www.facebook.com/s.php?q=' +
             encodeURIComponent(document.getElementById('facebook-search').value), false);
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
