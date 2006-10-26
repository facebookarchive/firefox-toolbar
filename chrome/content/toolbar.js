var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var fbToolbarObserver = {
  observe: function(subject, topic, data) {
    debug('facebook toolbar observing something: ' + topic);
    switch (topic) {
      case 'facebook-msgs-updated':
        document.getElementById('facebook-notification-msgs').label = data;
        break;
      case 'facebook-pokes-updated':
        document.getElementById('facebook-notification-poke').label = data;
        break;
      case 'facebook-reqs-updated':
        document.getElementById('facebook-notification-reqs').label = data;
        break;
      case 'facebook-session-start':
        subject = subject.QueryInterface(Ci.fbIFacebookUser);
        document.getElementById('facebook-name-info').label = subject.name;
        document.getElementById('facebook-login-status').label = 'Logout';
        break;
      case 'facebook-session-end':
        document.getElementById('facebook-login-status').label = 'Login to Facebook';
        document.getElementById('facebook-name-info').label = '';
        facebook.clearFriends();
        break;
      case 'facebook-friends-updated':
        facebook.loadFriends();
        break;
      case 'facebook-new-friend':
      case 'facebook-friend-updated':
        subject = subject.QueryInterface(Ci.fbIFacebookUser);
        facebook.updateFriend(subject);
        break;
    }
  }
};

var facebook = {
  load: function() {
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-start', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-friends-updated', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-friend-updated', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-new-friend', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-end', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-msgs-updated', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-pokes-updated', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-reqs-updated', false);
    document.getElementById('facebook-notification-msgs').label = fbSvc.numMsgs;
    document.getElementById('facebook-notification-poke').label = fbSvc.numPokes;
    document.getElementById('facebook-notification-reqs').label = fbSvc.numReqs;
    var loggedInUser = fbSvc.loggedInUser;
    if (loggedInUser) {
      loggedInUser = loggedInUser.QueryInterface(Ci.fbIFacebookUser);
      document.getElementById('facebook-name-info').label = loggedInUser.name;
      document.getElementById('facebook-login-status').label = 'Logout';
    }
    facebook.loadFriends();
    document.getElementById('facebook-search').addEventListener('keypress', HandleKeyPress, true);
    debug('facebook toolbar loaded.');
  },

  unload: function() {
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-session-start');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-friends-updated');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-friend-updated');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-new-friend');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-session-end');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-msgs-updated');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-pokes-updated');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-reqs-updated');
    debug('facebook toolbar unloaded.');
  },

  sortFriends: function(f1, f2) {
    if (f1.name < f2.name) return -1;
    else if (f1.name > f2.name) return 1;
    else return 0;
  },
  loadFriends: function() {
    debug('loadFriends()');
    var list = document.getElementById('PopupFacebookFriendsList');
    if (list.firstChild) {
      return;
    }
    var count = {};
    var friends = fbSvc.getFriends(count);
    debug('got friends', count.value);
    friends.sort(this.sortFriends);
    for each (var friend in friends) {
      this.createFriendNode(list, friend, null);
    }
  },
  updateFriend: function(friend) {
    friend = friend.QueryInterface(Ci.fbIFacebookUser);
    var elem = document.getElementById('popup-' + friend.id);
    this.createFriendNode(list, friend, elem);
  },
  createFriendNode: function(list, friend, elem) {
    if (!elem) {
      var item = document.createElement('richlistitem');
      item.setAttribute('id', 'popup-' + friend.id);
      item.setAttribute('class', 'popupFriendBox');
    } else {
      var item = elem;
    }
    item.setAttribute('friendname', friend.name);
    var firstName = friend.name.substr(0, friend.name.indexOf(' '));
    if (!firstName) firstName = friend.name;
    item.setAttribute('firstname', firstName);
    if (friend.status) {
      item.setAttribute('status', firstName + ' is ' + friend.status);
    }
    item.setAttribute('onmouseover', "SelectItemInList(this, this.parentNode)");
    item.setAttribute('onmouseup', "this.doCommand();"); // for some reason onclick events aren't getting fired so we'll just use mouseup
    item.setAttribute('oncommand', "OpenFBUrl('profile.php', '" + friend.id + "', event)");
    item.setAttribute('userid', friend.id);
    item.setAttribute('pic', friend.pic);
    if (!elem) {
      // Note that this will put new friends at the bottom instead of alphabetized, but I think that's ok.
      // It would get fixed in any new windows or when the browser restarts.
      list.appendChild(item);
    }
  },
  searchBoxFocus: function(searchBox) {
    if (!this.ignoreBlur && document.getElementById('viewFacebookSidebar').getAttribute('checked') != 'true') {
      document.getElementById('PopupFacebookFriends').showPopup(searchBox, -1, -1, 'tooltip', 'bottomleft', 'topleft');
      // if the sidebar was just open then we would be out of sync, so let's just filter the list to be safe
      SearchFriends(searchBox.value);
    }
  },
  searchBoxBlur: function(searchBox) {
    if (!this.ignoreBlur) {
      document.getElementById('PopupFacebookFriends').hidePopup();
    }
  },
  share: function() {
    try {
      // If we're not on a facebook page, just jump down to the catch block and open the popup...
      if (!/^(?:.*\.)?facebook\.[^.]*$/.test(content.document.location.host))
        throw null;
      // We're on a facebook page, so let's try using share_internal_bookmarklet...

      // We can access the function easily through content's wrappedJSObject, but unfortunately if
      // we try calling it directly, then the relative URL's in XMLHttpRequests are interpretted
      // relative to our current chrome:// url and fail.  So instead we check for the function...
      if (!content.wrappedJSObject.share_internal_bookmarklet)
          throw null;
      // ...and if the function is there then we have to do this lame <script> injection hack to
      // execute it.
      var script = content.document.createElement('script');
      script.appendChild(content.document.createTextNode("share_internal_bookmarklet();"));
      content.document.body.appendChild(script);
      content.document.body.removeChild(script);
    } catch(e) {
      debug('title is: ' + document.title, 'url: ' + content.document.location.href);
      window.open('http://www.dev.facebook.com/sharer.php?bm&v=1&u=' +
                  encodeURIComponent(content.document.location.href) +
                  '&t=' + encodeURIComponent(document.title),
                  'sharer','toolbar=no,status=yes,width=626,height=436');
    }
  },
  clearFriends: function() {
    var list = document.getElementById('PopupFacebookFriendsList');
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
  }
};
window.addEventListener('load', facebook.load, false);
window.addEventListener('unload', facebook.unload, false);

debug('loaded toolbar.js');
