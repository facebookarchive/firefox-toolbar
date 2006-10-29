var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var observer = {
    observe: function(subject, topic, data) {
        debug('OBSERVING SOMETHING: ' + topic);
        var panel = document.getElementById('facebook-panel');
        switch (topic) {
            case 'facebook-session-end':
                ClearFriends();
                break;
            case 'facebook-friends-updated':
                UpdateFriends();
                break;
            case 'facebook-friend-updated':
                if (data != 'status') {
                    document.getElementById('sidebar-' + friend.id).setAttribute(data, friend[data]);
                    break;
                }
                // else fall-through...
            case 'facebook-new-friend':
                friendsToUpdate.push(subject);
                break;
        }
    }
};

function ClearFriends() {
    var list = document.getElementById('SidebarFriendsList');
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }
    CreateLoginNode(list);
}

function SortFriends(f1, f2) {
    if (f1.stime != f2.stime) {
        return f2.stime - f1.stime;
    } else if (f2.name.toLowerCase() < f1.name.toLowerCase()) {
        return 1;
    } else {
        return -1;
    }
}

function LoadFriends() {
    debug('LoadFriends()');
    var list = document.getElementById('SidebarFriendsList');
    if (!fbSvc.loggedIn) {
        CreateLoginNode(list);
    } else {
        var count = {};
        var friends = fbSvc.getFriends(count);
        debug('got friends', count.value);
        RemoveLoginNode(list);
        friends.sort(SortFriends);
        for each (var friend in friends) {
            CreateFriendNode(list, friend, null);
        }
        SearchFriends(GetFBSearchBox().value);
    }
}

var friendsToUpdate = [];
function UpdateFriends() {
    debug('UpdateFriends');
    var list = document.getElementById('SidebarFriendsList');
    if (!list.firstChild || list.firstChild.id == 'sidebar-login') {
        LoadFriends();
        return;
    }
    friendsToUpdate.sort(SortFriends);
    var first = list.firstChild;
    for each (var friend in friendsToUpdate) {
        friend = friend.QueryInterface(Ci.fbIFacebookUser);
        var toRemove = document.getElementById('sidebar-' + friend.id);
        debug('remove:', toRemove, friend.id, friend.name);
        list.removeChild(toRemove);
        CreateFriendNode(list, friend, first);
    }
    friendsToUpdate = [];
}

function CreateLoginNode(list) {
    var item = document.createElement('richlistitem');
    item.setAttribute('id', 'sidebar-login');
    item.setAttribute('class', 'emptyBox');
    item.setAttribute('onclick', 'this.doCommand()');
    item.setAttribute('oncommand', 'FacebookLogin()');
    item.appendChild(document.createTextNode('Login from the toolbar to see your friends list.')); 
    list.insertBefore(item, null);
}
function RemoveLoginNode(list) {
    if (document.getElementById('sidebar-login')) {
        list.removeChild(document.getElementById('sidebar-login'));
    }
}

function CreateFriendNode(list, friend, insertBefore) {
    var item = document.createElement('richlistitem');
    item.setAttribute('id', 'sidebar-' + friend.id);
    item.setAttribute('class', 'friendBox');
    item.setAttribute('friendname', friend.name);
    item.setAttribute('wall', 'wall: ' + friend.wall);
    item.setAttribute('notes', 'notes: ' + friend.notes);
    var firstName = friend.name.substr(0, friend.name.indexOf(' '));
    if (!firstName) firstName = friend.name;
    item.setAttribute('firstname', firstName);
    if (friend.status) {
	item.appendChild(document.createTextNode(firstName + ' is ' + friend.status));
    }
    item.setAttribute('oncommand', "OpenFBUrl('profile.php', '" + friend.id + "', event)");
    item.setAttribute('msgCmd', "OpenFBUrl('message.php', '" + friend.id + "', event)");
    item.setAttribute('pokeCmd', "OpenFBUrl('poke.php', '" + friend.id + "', event)");
    item.setAttribute('wallCmd', "OpenFBUrl('wall.php', '" + friend.id + "', event)");
    item.setAttribute('notesCmd', "OpenFBUrl('notes.php', '" + friend.id + "', event)");
    if (!friend.pic) {
      item.setAttribute('pic', 'http://static.ak.facebook.com/pics/t_default.jpg');
    } else {
      item.setAttribute('pic', friend.pic + '&size=thumb');
    }
    list.insertBefore(item, insertBefore);
}

function SidebarLoad() {
    debug('SidebarLoad');
    top.document.getElementById('facebook-sidebar-toggle').checked = true;
    top.document.getElementById('PopupFacebookFriends').hidePopup(); // just in case it was still showing
    LoadFriends();
    obsSvc.addObserver(observer, 'facebook-new-friend', false);
    obsSvc.addObserver(observer, 'facebook-friend-updated', false);
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
    top.document.getElementById('sidebar-splitter').addEventListener('mouseup', SidebarResize, false);
    SidebarResize();
}
function SidebarUnload() {
    debug('SidebarUnload');
    top.document.getElementById('facebook-sidebar-toggle').checked = false;
    obsSvc.removeObserver(observer, 'facebook-new-friend');
    obsSvc.removeObserver(observer, 'facebook-friend-updated');
    obsSvc.removeObserver(observer, 'facebook-friends-updated');
    obsSvc.removeObserver(observer, 'facebook-session-end');
    top.document.getElementById('sidebar-splitter').removeEventListener('mouseup', SidebarResize, false);
}
var statusWidthStyleRule = false;
function SidebarResize() {
    debug('setting status width', window.innerWidth);
    var sheet = document.styleSheets[0];
    if (statusWidthStyleRule !== false) {
        sheet.deleteRule(statusWidthStyleRule+1);
        sheet.deleteRule(statusWidthStyleRule);
    }
    statusWidthStyleRule = sheet.cssRules.length;
    sheet.insertRule(".status { width: " + (window.innerWidth-82) + "px; }", statusWidthStyleRule);
    sheet.insertRule(".login_to_see_message { width: " + (window.innerWidth-32) + "px; }", statusWidthStyleRule+1);
}
var facebook=null; // for some reason lib.js can't seem to handle not having something named facebook defined

debug('loaded sidebar.js');
