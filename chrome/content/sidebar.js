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
        SearchFriends(top.document.getElementById('facebook-search').value);
    } else {
        debug('no friends');
    }
}

function SidebarLoad() {
    debug('SidebarLoad');
    top.document.getElementById('facebook-tbbutton').checked = true;
    LoadFriends();
    obsSvc.addObserver(observer, 'facebook-friends-updated', false);
    // XXX if the toolbar is not present, add a search box to the top of the sidebar, kind of like this:
    // <hbox>
    //   <textbox type="timed" timeout="500" id="facebook-search" oncommand="SidebarType(event)" flex="1"/>
    //   <button id="do-search" oncommand="DoWebSearch(event, this.previousSibling)" label="Search"/>
    // </hbox>
}
function SidebarUnload() {
    debug('SidebarUnload');
    top.document.getElementById('facebook-tbbutton').checked = false;
    obsSvc.removeObserver(observer, 'facebook-friends-updated');
}

debug('loaded sidebar.js');
