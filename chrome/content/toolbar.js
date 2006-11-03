var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var fbToolbarObserver = {
  observe: function(subject, topic, data) {
    debug('facebook toolbar observing something: ' + topic);
    switch (topic) {
      case 'facebook-msgs-updated':
        setAttributeById('facebook-notification-msgs', 'label', data);
        break;
      case 'facebook-pokes-updated':
        setAttributeById('facebook-notification-poke', 'label', data);
        break;
      case 'facebook-reqs-updated':
        setAttributeById('facebook-notification-reqs', 'label', data);
        break;
      case 'facebook-session-start':
        subject = subject.QueryInterface(Ci.fbIFacebookUser);
        setAttributeById('facebook-name-info', 'label', subject.name);
        setAttributeById('facebook-name-info', 'userid', subject.id);
        setAttributeById('facebook-menu-my-profile', 'userid', subject.id);
        setAttributeById('facebook-login-status', 'label', 'Logout');
        setAttributeById('facebook-notification-msgs', 'label', '0');
        setAttributeById('facebook-notification-poke', 'label', '0');
        setAttributeById('facebook-notification-reqs', 'label', '0');
        var sb = GetFBSearchBox();
        if (sb.value != 'Search Facebook' && sb.value != '') {
          sb.value = ''; 
          this.searchBoxBlur(sb);
        }
        SetHint(true, 'Loading friends list...', '');
        break;
      case 'facebook-session-end':
        setAttributeById('facebook-login-status', 'label', 'Login to Facebook');
        setAttributeById('facebook-name-info', 'label', '');
        setAttributeById('facebook-notification-msgs', 'label', '?');
        setAttributeById('facebook-notification-poke', 'label', '?');
        setAttributeById('facebook-notification-reqs', 'label', '?');
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

var progListener = {
  onLocationChange: function(webProgress, request, location) {
    if (fbSvc.loggedIn) {
      if (IsFacebookLocation(location)) {
        fbSvc.hintPageLoad(true);
      } else {
        fbSvc.hintPageLoad(false);
      }
    }
  },
  onProgressChange: function(webProgress, request, curSelfProg, maxSelfProg, curTotalProg, maxTotalProg) {
  },
  onSecurityChange: function(webProgress, request, state) {
  },
  onStateChange: function(webProgress, request, stateFlags, status) {
  },
  onStatusChange: function(webProgress, request, status, message) {
  },
};

var facebook = {
  load: function() {
    var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
    if (!prefSvc.prefHasUserValue('extensions.facebook.not_first_run')) {
      getBrowser().loadOneTab('chrome://facebook/content/welcome.html', null, null, null, false, false)
      prefSvc.setBoolPref('extensions.facebook.not_first_run', true);
    }
    document.getElementById('facebook-search').addEventListener('keypress', HandleKeyPress, true);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-start', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-friends-updated', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-friend-updated', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-new-friend', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-end', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-msgs-updated', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-pokes-updated', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-reqs-updated', false);
    var loggedInUser = fbSvc.loggedInUser;
    if (loggedInUser) {
      loggedInUser = loggedInUser.QueryInterface(Ci.fbIFacebookUser);
      setAttributeById('facebook-name-info', 'label', loggedInUser.name);
      setAttributeById('facebook-name-info', 'userid', loggedInUser.id);
      setAttributeById('facebook-login-status', 'label', 'Logout');
      setAttributeById('facebook-menu-my-profile', 'userid', loggedInUser.id);
      setAttributeById('facebook-notification-msgs', 'label', fbSvc.numMsgs);
      setAttributeById('facebook-notification-poke', 'label', fbSvc.numPokes);
      setAttributeById('facebook-notification-reqs', 'label', fbSvc.numReqs);
    }
    facebook.loadFriends();
    getBrowser().addProgressListener(progListener);
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
    var n1 = f1.name.toLowerCase();
    var n2 = f2.name.toLowerCase();
    if (n1 < n2) return -1;
    else if (n1 > n2) return 1;
    else return 0;
  },
  loadFriends: function() {
    debug('loadFriends()');
    var list = document.getElementById('PopupFacebookFriendsList');
    if (list.firstChild && list.firstChild.id != 'FacebookHint') {
      return;
    }
    list.selectedIndex = -1;
    var count = {};
    var friends = fbSvc.getFriends(count);
    debug('got friends', count.value);
    if (!fbSvc.loggedIn) {
      SetHint(true, 'Login from the toolbar to see your friends list.', 'FacebookLogin()');
    } else if (!count.value) {
      SetHint(true, 'Loading friends list...', '');
    } else {
      friends.sort(this.sortFriends);
      for each (var friend in friends) {
        this.createFriendNode(list, friend, null);
      }
      if (!IsSidebarOpen()) {
        SearchFriends(GetFBSearchBox().value);
      }
    }
  },
  updateFriend: function(friend) {
    friend = friend.QueryInterface(Ci.fbIFacebookUser);
    var elem = document.getElementById('popup-' + friend.id);
    var list = document.getElementById('PopupFacebookFriendsList');
    this.createFriendNode(list, friend, elem);
  },
  createFriendNode: function(list, friend, elem) {
    if (!friend.name) return;
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
    SetStatus(item, friend.status, friend.stime);
    item.setAttribute('onmouseover', "SelectItemInList(this, this.parentNode)");
    item.setAttribute('onmousedown', "this.doCommand();");
    item.setAttribute('oncommand', "OpenFBUrl('profile.php', '" + friend.id + "', event)");
    item.setAttribute('userid', friend.id);
    item.setAttribute('pic', friend.pic);
    if (!elem) {
      // Note that this will put new friends at the bottom instead of alphabetized, but I think that's ok.
      // It would get fixed in any new windows or when the browser restarts.
      list.insertBefore(item, document.getElementById('FacebookHint'));
    }
  },
  searchBoxFocus: function(searchBox) {
    if (searchBox.value == 'Search Facebook') {
      searchBox.value=''; 
      searchBox.style.color='#000000';
    }
    if (!this.ignoreBlur && document.getElementById('viewFacebookSidebar').getAttribute('checked') != 'true') {
      document.getElementById('PopupFacebookFriends').showPopup(searchBox, -1, -1, 'popup', 'bottomleft', 'topleft');
      // if the sidebar was just open then we would be out of sync, so let's just filter the list to be safe
      if (fbSvc.loggedIn) {
        SearchFriends(searchBox.value);
      }
    }
  },
  searchBoxBlur: function(searchBox) {
    if (!this.ignoreBlur) {
      document.getElementById('PopupFacebookFriends').hidePopup();
    }
    if (searchBox.value=='') { 
      searchBox.style.color='#808080'; 
      searchBox.value = 'Search Facebook'; 
    }
  },
  share: function() {
    var p = '.php?src=tb&v=4&u=' + encodeURIComponent(content.document.location.href) + '&t=' + encodeURIComponent(document.title);
    var openCmd = "window.open('http://www.facebook.com/sharer" + p + "', 'sharer','toolbar=no,status=yes,width=626,height=436');";
    try {
      // If we're not on a facebook page, just jump down to the catch block and open the popup...
      if (!IsFacebookLocation(content.document.location))
        throw null;
      // We're on a facebook page, so let's try using share_internal_bookmarklet...

      // We can access the function easily through content's wrappedJSObject, but unfortunately if
      // we try calling it directly, then the relative URL's in XMLHttpRequests are interpretted
      // relative to our current chrome:// url and fail.  So instead we check for the function...
      if (!content.wrappedJSObject.share_internal_bookmarklet)
          throw null;
      // ...and if the function is there then we have to do this lame javascript: url hack to
      // execute it.
      content.document.location = 'javascript:try { share_internal_bookmarklet("' + p + '"); } catch (e) { setTimeout("' + openCmd + '", 0); } void(0);'
    } catch(e) {
      debug('title is: ' + document.title, 'url: ' + content.document.location.href);
      eval(openCmd);
    }
  },
  clearFriends: function() {
    var list = document.getElementById('PopupFacebookFriendsList');
    while (list.firstChild && list.firstChild.id != 'FacebookHint') {
      list.removeChild(list.firstChild);
    }
    document.getElementById('PopupMessager').style.display = 'none';
    document.getElementById('PopupPoker').style.display = 'none';
    document.getElementById('PopupPoster').style.display = 'none';
    SetHint(true, 'Login from the toolbar to see your friends list.', 'FacebookLogin()');
  }
};
window.addEventListener('load', facebook.load, false);
window.addEventListener('unload', facebook.unload, false);

debug('loaded toolbar.js');
