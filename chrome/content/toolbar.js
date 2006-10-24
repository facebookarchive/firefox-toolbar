var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var fbToolbarObserver = {
  observe: function(subject, topic, data) {
    debug('facebook toolbar observing something: ' + topic);
    switch (topic) {
      case 'facebook-new-message':
        document.getElementById('facebook-notification-msgs').label = data;
        break;
      case 'facebook-new-poke':
        document.getElementById('facebook-notification-poke').label = data;
        break;
      case 'facebook-friends-updated':
        facebook.loadFriends();
        break;
      case 'facebook-session-start':
        subject = subject.QueryInterface(Ci.fbIFacebookUser);
        document.getElementById('facebook-login-info-name').label = subject.name;
        break;
      case 'facebook-session-end':
        break;
    }
  }
};

var facebook = {
  load: function() {
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-start', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-friends-updated', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-end', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-new-message', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-new-poke', false);
    document.getElementById('facebook-notification-msgs').label = fbSvc.numMsgs;
    document.getElementById('facebook-notification-poke').label = fbSvc.numPokes;
    var loggedInUser = fbSvc.loggedInUser;
    if (loggedInUser) {
      loggedInUser = loggedInUser.QueryInterface(Ci.fbIFacebookUser);
      document.getElementById('facebook-login-info-name').label = loggedInUser.name;
    }
    facebook.loadFriends();
    document.getElementById('facebook-search').addEventListener('keypress', HandleKeyPress, true);
    debug('facebook toolbar loaded.');
  },

  unload: function() {
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-session-start');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-friends-updated');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-session-end');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-new-message');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-new-poke');
    debug('facebook toolbar unloaded.');
  },

  loadFriends: function() {
    debug('loadFriends()');
    var list = document.getElementById('PopupFacebookFriendsList');
    var friends = fbSvc.friendsRdf;
    if (friends) {
      list.database.AddDataSource(friends);
      list.builder.rebuild();
    } else {
      debug('no friends');
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
  }
};
window.addEventListener('load', facebook.load, false);
window.addEventListener('unload', facebook.unload, false);

debug('loaded toolbar.js');
