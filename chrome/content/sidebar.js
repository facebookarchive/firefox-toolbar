
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
                ClearFriends(true);
                break;
            case 'facebook-friends-updated':
                UpdateFriends();
                break;
            case 'facebook-friend-updated':
                if (data != 'status') {
                    if (data == 'status-delete') {
                        subject = subject.QueryInterface(Ci.fbIFacebookUser);
                        SetStatus(document.getElementById('sidebar-' + subject.id), null, 0);
                    }
                    // we don't care about wall or notes count updates anymore here
                    break;
                }
                if (document.getElementById('fbSidebarSorter').getAttribute('selectedsort') == 'name') {
                    // if sorting by name, just update the entry
                    subject = subject.QueryInterface(Ci.fbIFacebookUser);
                    SetStatus(document.getElementById('sidebar-' + subject.id), subject.status, subject.stime);
                    break;
                }
                // else fall-through...
            case 'facebook-new-friend':
                friendsToUpdate.push(subject.QueryInterface(Ci.fbIFacebookUser));
                break;
            case 'facebook-new-day':
                ClearFriends(false);
                LoadFriends();
                break;
        }
    }
};

function SortBy(field) {
    var sorter = document.getElementById('fbSidebarSorter');
    sorter.setAttribute('selectedsort', field);
    sorter.setAttribute('label', 'Sorting by ' + field);
    ClearFriends(false);
    LoadFriends();
}

function ClearFriends(sessionEnded) {
    var list = document.getElementById('SidebarFriendsList');
    while (list.firstChild && list.firstChild.id != 'FacebookHint') {
        list.removeChild(list.firstChild);
    }
    if (sessionEnded) {
        SetHint(true, 'Login from the toolbar to see your friends list.', 'FacebookLogin()');
    }
}

function SortFriendsStatus(f1, f2) {
    if (f1.stime != f2.stime) {
        return f2.stime - f1.stime;
    } else if (f2.name.toLowerCase() < f1.name.toLowerCase()) {
        return 1;
    } else {
        return -1;
    }
}
function SortFriendsAlpha(f1, f2) {
    var n1 = f1.name.toLowerCase();
    var n2 = f2.name.toLowerCase();
    if (n1 < n2) return -1;
    else if (n1 > n2) return 1;
    else return 0;
}

function LoadFriends() {
    debug('LoadFriends()');
    var list = document.getElementById('SidebarFriendsList');
    var count = {};
    var friends = fbSvc.getFriends(count);
    debug('got friends', count.value);
    if (!fbSvc.loggedIn) {
        SetHint(true, 'Login from the toolbar to see your friends list.', 'FacebookLogin()');
    } else if (!count.value) {
        SetHint(true, 'Loading friends list...', '');
    } else {
        var hint = document.getElementById('FacebookHint');
        if (document.getElementById('fbSidebarSorter').getAttribute('selectedsort') == 'name') {
            friends.sort(SortFriendsAlpha);
        } else {
            friends.sort(SortFriendsStatus);
        }
        for each (var friend in friends) {
            CreateFriendNode(list, friend, hint);
        }
        var searchTerm = GetFBSearchBox().value;
        if (searchTerm != 'Search Facebook') {
            SearchFriends(searchTerm);
        } else {
            SetHint(false, '', '');
        }
    }
}

var friendsToUpdate = [];
function UpdateFriends() {
    debug('UpdateFriends');
    var list = document.getElementById('SidebarFriendsList');
    if (!list.firstChild || list.firstChild.id == 'FacebookHint') {
        LoadFriends();
        return;
    }
    friendsToUpdate.sort(SortFriendsStatus);
    var first = list.firstChild;
    for each (var friend in friendsToUpdate) {
        var toRemove = document.getElementById('sidebar-' + friend.id);
        debug('remove:', toRemove, friend.id, friend.name);
        if (toRemove) {
            if (toRemove == first) {
                // fixes the problem where the first person in your list updates their status
                first = first.nextSibling;
            }
            list.removeChild(toRemove);
        }
        CreateFriendNode(list, friend, first);
    }
    friendsToUpdate = [];
    var searchTerm = GetFBSearchBox().value;
    if (searchTerm != 'Search Facebook') {
        SearchFriends(searchTerm);
    }
}
function CreateFriendNode(list, friend, insertBefore) {
    if (!friend.name) return;
    var item = document.createElement('richlistitem');
    item.setAttribute('id', 'sidebar-' + friend.id);
    item.setAttribute('class', 'friendBox');
    item.setAttribute('friendname', friend.name);
    //item.setAttribute('wall', 'wall: ' + friend.wall);
    //item.setAttribute('notes', 'notes: ' + friend.notes);
    var firstName = friend.name.substr(0, friend.name.indexOf(' '));
    if (!firstName) firstName = friend.name;
    item.setAttribute('firstname', firstName);
    SetStatus(item, friend.status, friend.stime);
    item.setAttribute('oncommand', "OpenFBUrl('profile.php', '" + friend.id + "', event)");
    item.setAttribute('msgCmd', "OpenFBUrl('message.php', '" + friend.id + "', event)");
    item.setAttribute('pokeCmd', "OpenFBUrl('poke.php', '" + friend.id + "', event)");
    item.setAttribute('postCmd', "OpenFBUrl('wallpost.php', '" + friend.id + "', event)");
    //item.setAttribute('wallCmd', "OpenFBUrl('wall.php', '" + friend.id + "', event)");
    //item.setAttribute('notesCmd', "OpenFBUrl('notes.php', '" + friend.id + "', event)");
    item.setAttribute('pic', friend.pic);
    list.insertBefore(item, insertBefore);
}

function SidebarLoad() {
    debug('SidebarLoad');
    top.document.getElementById('facebook-sidebar-toggle').checked = true;
    top.document.getElementById('PopupFacebookFriends').hidePopup(); // just in case it was still showing
    var sorter = document.getElementById('fbSidebarSorter');
    if (sorter.getAttribute('selectedsort') == 'name') {
        sorter.setAttribute('label', 'Sorting by name');
        document.getElementById('fbSortName').setAttribute('checked', 'true');
    } else {
        sorter.setAttribute('label', 'Sorting by status');
        document.getElementById('fbSortStatus').setAttribute('checked', 'true');
    }
    LoadFriends();
    obsSvc.addObserver(observer, 'facebook-new-friend', false);
    obsSvc.addObserver(observer, 'facebook-friend-updated', false);
    obsSvc.addObserver(observer, 'facebook-friends-updated', false);
    obsSvc.addObserver(observer, 'facebook-session-end', false);
    obsSvc.addObserver(observer, 'facebook-new-day', false);
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
    obsSvc.removeObserver(observer, 'facebook-new-day');
    top.document.getElementById('sidebar-splitter').removeEventListener('mouseup', SidebarResize, false);
}
var statusWidthStyleRule = false;
function SidebarResize() {
    debug('setting status width', window.innerWidth);
    var sheet = document.styleSheets[0];
    if (statusWidthStyleRule !== false) {
        debug('deleting', statusWidthStyleRule, sheet.cssRules.length);
        sheet.deleteRule(statusWidthStyleRule);
    }
    statusWidthStyleRule = sheet.cssRules.length;
    sheet.insertRule(".status { width: " + (window.innerWidth-82) + "px !important; }", statusWidthStyleRule);
}
var facebook=null; // for some reason lib.js can't seem to handle not having something named facebook defined

debug('loaded sidebar.js');
