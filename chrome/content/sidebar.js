var Cc = Components.classes;
var Ci = Components.interfaces;

const kXULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";       

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var observer = {
    observe: function(subject, topic, data) {
        debug('OBSERVING SOMETHING: ' + topic);
        var panel = document.getElementById('facebook-panel');
        switch (topic) {
            case 'facebook-friends-updated':
            case 'facebook-session-end':
                LoadFriends();
                break;
        }
    }
};

function LoadFriends() {
    debug('LoadFriends()');
    var list = document.getElementById('SidebarFriendsList');
    var friends = fbSvc.friendsRdf;
    if (friends) {
        list.database.AddDataSource(friends);
        list.builder.rebuild();
        SearchFriends(GetFBSearchBox().value);
    } else {
        debug('no friends');
    }
}

function SidebarLoad() {
    debug('SidebarLoad');
    top.document.getElementById('facebook-sidebar-toggle').checked = true;
    LoadFriends();
    obsSvc.addObserver(observer, 'facebook-friends-updated', false);
    obsSvc.addObserver(observer, 'facebook-session-end', false);
    document.getElementById('SidebarFriendsList').addEventListener('keypress', HandleKeyPress, true);
    if (!top.document.getElementById('facebook-search')) {
        // XXX for some reason even if the toolbar is hidden we can still see
        // the search-box, so this never happens...we'll keep the code in case
        // we get a chance to figure it out later, though.
        document.getElementById('facebook-search-sidebar').style.display = '';
        document.getElementById('facebook-search-sidebar').addEventListener('keypress', HandleKeyPress, true);
    } else {
        document.getElementById('facebook-search-sidebar').style.display = 'none';
    }
}
function SidebarUnload() {
    debug('SidebarUnload');
    top.document.getElementById('facebook-sidebar-toggle').checked = false;
    obsSvc.removeObserver(observer, 'facebook-friends-updated');
    obsSvc.removeObserver(observer, 'facebook-session-end');
}
var facebook=null; // for some reason lib.js can't seem to handle not having something named facebook defined

debug('loaded sidebar.js');
