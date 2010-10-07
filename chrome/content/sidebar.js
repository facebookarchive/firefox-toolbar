/**
 *
 * The source code included in this file is licensed to you by Facebook under
 * the Apache License, Version 2.0.  Accordingly, the following notice
 * applies to the source code included in this file:
 *
 * Copyright © 2009 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 */


var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
var fbStringBundle = null;

var observer = {
    observe: function(subject, topic, data) {
        fbLib.debug('OBSERVING SOMETHING: ', topic);
        var panel = document.getElementById('facebook-panel');
        topicSwitch:
        switch (topic) {
            case 'facebook-session-end':
                ClearFriends(true);
                break;
            case 'facebook-friends-updated':
                UpdateFriends();
                break;
            case 'facebook-friend-updated':
                if( data == 'status-delete' ) {
                  subject = subject.QueryInterface(Ci.fbIFacebookUser);
                  fbLib.SetStatus(document.getElementById('sidebar-' + subject.id), null, 0);
                }
                else if(  data == 'status'
                       || data == 'profile' ) {
                  subject = subject.QueryInterface(Ci.fbIFacebookUser);
                  var elt = document.getElementById('sidebar-' + subject.id);
                  var selSort = document.getElementById('fbSidebarSorter').getAttribute('selectedsort');
                  if( data == 'status' ) {
                    fbLib.SetStatus( elt, subject.status, subject.stime);
                    if( selSort == 'name' || selSort == 'profile' )
                      break;
                  }
                  else {
                    fbLib.SetProfileTime(elt, subject.ptime);
                    if( selSort == 'name' || selSort == 'status' )
                      break;
                  }
                  friendsToUpdate.push(subject);
                }
                else
                  fbLib.debug( 'ignoring', topic, data );
                break;
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

function NameCmp(friend1,friend2) {
  var n1 = friend1.name.toLowerCase();
  var n2 = friend2.name.toLowerCase();
  if (n1 < n2) return -1;
  else if (n1 > n2) return 1;
  else return 0;
};

/*
 * Class FriendSort
 * Encapsulates a sort order for a list of facebook friends.
 */
function FriendSort( field, eltId, func){
  fbLib.debug("Constructor", typeof func);
  this.field = field;
  this.eltId = eltId;
  if( 'function' == typeof func ) {
    var fallback = this.defaultSortFunc;
    this.sortFunc = function(friend1,friend2) {
      var res = func(friend1,friend2);
      return ( 0 != res ) ? res : fallback(friend1,friend2);
    };
  }
  else
    this.sortFunc = this.defaultSortFunc;
}
FriendSort.prototype.__defineGetter__( "label", function() {
    var fld = (this.field == "last update") ? "lastupdate" : this.field;
    var sortie = fbStringBundle.getString(fld);
    return fbStringBundle.getFormattedString('sortingby', [sortie]);
});
FriendSort.prototype.callbackSortFunc =
FriendSort.prototype.defaultSortFunc = NameCmp;

var _friend_sorts = {
  'name':   new FriendSort( 'name', 'fbSortName', null ),
  'status': new FriendSort( 'status', 'fbSortStatus',
    function(friend1, friend2) { // compare status update times
      return friend2.stime - friend1.stime;
    }),
  'profile': new FriendSort( 'profile', 'fbSortProfile',
    function(friend1, friend2) { // compare profile update times
      return friend2.ptime - friend1.ptime;
    }),
  'last update': new FriendSort( 'last update', 'fbSortUpdate',
    function(friend1, friend2) { // compare more recent of status,profile update time
      return Math.max( friend2.ptime, friend2.stime )
           - Math.max( friend1.ptime, friend1.stime );
    }),
};

function GetFriendSort() {
  var selSort = document.getElementById('fbSidebarSorter').getAttribute('selectedsort');
  var friendSorter  = _friend_sorts[selSort];
  fbLib.debug( "FriendSort", selSort, friendSorter );
  return friendSorter;
}

function SortBy(selSort) {
    fbLib.debug( "Sorting by...", selSort)
    var sorter = document.getElementById('fbSidebarSorter');
    sorter.setAttribute('selectedsort', selSort);
    sorter.setAttribute('label', _friend_sorts[selSort].label );
    ClearFriends(false);
    fbLib.debug( "Sort call to LoadFriends" );
    LoadFriends();
}

function ClearFriends(sessionEnded) {
    fbLib.debug( "ClearFriends" );
    var list = document.getElementById('SidebarFriendsList');
    while (list.firstChild && list.firstChild.id != 'FacebookHint') {
        list.removeChild(list.firstChild);
    }
    if (sessionEnded) {
        fbLib.SetHint(true, fbStringBundle.getString('loadFriends'), 'fbLib.FacebookLogin()');
    }
}

function LoadFriends() {
    var list = document.getElementById('SidebarFriendsList');
    var count = {};
    var friends = fbSvc.getFriends(count);
    fbLib.debug('Loading friends', count.value);
    if (!fbSvc.loggedIn) {
        fbLib.SetHint(true, fbStringBundle.getString('loadFriends'), 'fbLib.FacebookLogin()');
    } else if (!count.value) {
        fbLib.SetHint(true, fbStringBundle.getString('loadingfriends'), '');
    } else {
        var friendSort = GetFriendSort();
        fbLib.debug( "Sorting friends", friendSort.field );
        fbLib.debug( NameCmp == friendSort.defaultSortFunc );
        friends.sort( friendSort.sortFunc );
        // friends.sort(NameCmp);

        var hint = document.getElementById('FacebookHint');
        for each (var friend in friends) {
            CreateFriendNode(list, friend, hint);
        }
        var searchTerm = fbLib.GetFBSearchBox().value;
        if (searchTerm != fbStringBundle.getString('searchplaceholder')) {
            fbLib.SearchFriends(searchTerm);
        } else {
            fbLib.SetHint(false, '', '');
        }
    }
}

var friendsToUpdate = [];
function UpdateFriends() {
    fbLib.debug('UpdateFriends');
    var list = document.getElementById('SidebarFriendsList');
    if (!list.firstChild || list.firstChild.id == 'FacebookHint') {
        return LoadFriends();
    }
    var sorter = GetFriendSort();
    friendsToUpdate.sort(sorter.sortFunc);
    var first = list.firstChild;
    for each (var friend in friendsToUpdate) {
        var toRemove = document.getElementById('sidebar-' + friend.id);
        fbLib.debug('remove:', toRemove, friend.id, friend.name);
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
    var searchTerm = fbLib.GetFBSearchBox().value;
    if (searchTerm != fbStringBundle.getString('searchplaceholder')) {
        fbLib.SearchFriends(searchTerm);
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
    fbLib.SetStatus(item, friend.status, friend.stime);
    item.setAttribute('ptime', fbLib.getProfileTime(friend.ptime) );
    item.setAttribute('oncommand', "fbLib.OpenFBUrl('profile.php', '" + friend.id + "', event, null )");
    item.setAttribute('viewUpdCmd', "fbLib.OpenFBUrl('profile.php', '" + friend.id + "', event, {highlight: null} ); return false;");
    item.setAttribute('msgCmd', "fbLib.OpenFBUrl('message.php', '" + friend.id + "', event, null )");
    item.setAttribute('pokeCmd', "fbLib.OpenFBUrl('poke.php', '" + friend.id + "', event, null )");
    item.setAttribute('postCmd', "fbLib.OpenFBUrl('wallpost.php', '" + friend.id + "', event, null )");
    //item.setAttribute('wallCmd', "fbLib.OpenFBUrl('wall.php', '" + friend.id + "', event)");
    //item.setAttribute('notesCmd', "fbLib.OpenFBUrl('notes.php', '" + friend.id + "', event)");
    item.setAttribute('pic', friend.pic);
    list.insertBefore(item, insertBefore);
}

function OpenSettings() { /* modified from optionsmenu extension */
    fbLib.debug("OpenSettings()");
    var url = "chrome://facebook/content/settings.xul";
    var features = "chrome,titlebar,toolbar,centerscreen";
    try {
        var prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
        var instantApply = prefs.getBoolPref("browser.preferences.instantApply");
        features += instantApply ? ",dialog=no" : ",modal";
    }
    catch (e) {
        features += ",modal";
    }
    openDialog( url, "", features);
}

var _sidebar_topics = ['facebook-new-friend',
                       'facebook-friend-updated',
                       'facebook-friends-updated',
                       'facebook-session-end',
                       'facebook-new-day' ];
function SidebarLoad() {
    fbLib.debug('SidebarLoad');
    fbStringBundle = fbLib.GetFBStringBundle()
    top.document.getElementById('facebook-sidebar-toggle').checked = true;
    top.document.getElementById('PopupFacebookFriends').hidePopup(); // just in case it was still showing

    var sorter = document.getElementById('fbSidebarSorter');
    var selSort = sorter.getAttribute('selectedsort');
    var friendSort = _friend_sorts[selSort];
    fbLib.debug( "selSort", selSort, friendSort.label, friendSort.eltId );
    sorter.setAttribute('label', friendSort.label );
    document.getElementById(friendSort.eltId).setAttribute('checked', 'true');

    LoadFriends();
    for each( var topic in _sidebar_topics )
      obsSvc.addObserver(observer, topic, false);
    // document.getElementById('SidebarFriendsList').addEventListener('keypress', fbLib.HandleKeyPress, true);
    if (!top.document.getElementById('facebook-search')) {
        // XXX for some reason even if the toolbar is hidden we can still see
        // the search-box, so this never happens...we'll keep the code in case
        // we get a chance to figure it out later, though.
        document.getElementById('facebook-search-sidebar').style.display = '';
        document.getElementById('facebook-search-sidebar').addEventListener('keypress', fbLib.HandleKeyPress, true);
    } else {
        document.getElementById('facebook-search-sidebar').style.display = 'none';
    }
    // top.document.getElementById('sidebar-splitter').addEventListener('mouseup', SidebarResize, false);
    // SidebarResize();
}
function SidebarUnload() {
    fbLib.debug('SidebarUnload');
    top.document.getElementById('facebook-sidebar-toggle').checked = false;
    for each( var topic in _sidebar_topics )
      obsSvc.removeObserver(observer, topic);
    // top.document.getElementById('sidebar-splitter').removeEventListener('mouseup', SidebarResize, false);
}

/*
var statusWidthStyleRule = false;
function SidebarResize() {
    fbLib.debug('setting status width', window.innerWidth);
    var sheet = document.styleSheets[0];
    if (false !== statusWidthStyleRule) {
        fbLib.debug('deleting', statusWidthStyleRule, sheet.cssRules.length);
        sheet.deleteRule(statusWidthStyleRule);
    }
    statusWidthStyleRule = sheet.cssRules.length;
    sheet.insertRule(".status { width: " + (window.innerWidth-90) + "px !important; }", statusWidthStyleRule);
}
*/
var facebook=null; // for some reason lib.js can't seem to handle not having something named facebook defined

fbLib.debug('loaded sidebar.js');
