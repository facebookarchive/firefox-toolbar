var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var fbToolbarObserver = {
  observe: function(subject, topic, data) {
    dump('facebook toolbar observing something: ' + topic + '\n');
    switch (topic) {
      case 'facebook-new-message':
        document.getElementById('facebook-notification-msgs').label = data;
        break;
      case 'facebook-new-poke':
        document.getElementById('facebook-notification-poke').label = data;
        break;
      case 'facebook-session-start':
        break;
      case 'facebook-session-end':
        break;
    }
  }
};

var facebook = {
  load: function() {
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-start', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-end', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-new-message', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-new-poke', false);
    document.getElementById('facebook-notification-msgs').label = fbSvc.numMsgs;
    document.getElementById('facebook-notification-poke').label = fbSvc.numPokes;
    facebook.loadFriends();
    dump('facebook toolbar loaded.\n');
  },

  unload: function() {
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-session-start');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-session-end');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-new-message');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-new-poke');
    dump('facebook toolbar unloaded.\n');
  },

  get_current_document: function() {
    return document.getElementById('content').selectedBrowser.contentWindow.document;
  },

  go_url: function(url) {
    this.get_current_document().location.href=url;
  },
  loadFriends: function() {
    dump('loadFriends()\n');
    var list = document.getElementById('PopupFacebookFriendsList');
    var friends = fbSvc.friendsRdf;
    if (friends) {
      list.database.AddDataSource(friends);
      list.builder.rebuild();
    } else {
      dump('no friends\n');
    }
  },
  searchFriends: function(searchBox) {
    if (searchBox.value) {
        var search = searchBox.value.toLowerCase();
    }
    dump('searching for: ' + search+ '\n');
    if (search == this.currentSearch) {
      dump('already searched for that\n');
      return;
    }
    this.currentSearch = search;
    /*
    var now = (new Date()).getTime();
    if (waitTil > now) {
        dump('still waiting\n');
        window.setTimeout("SearchFriends(document.getElementById('facebook-search'))", waitTil - now);
        return;
    }
    */
    if (search) {
      for each (var node in document.getElementById('PopupFacebookFriendsList').childNodes) {
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
      for each (var node in document.getElementById('PopupFacebookFriendsList').childNodes) {
        if (node.style) {
          node.style.display = '';
        }
      }
    }
  }
};
window.addEventListener('load', facebook.load, false);
window.addEventListener('unload', facebook.unload, false);

dump('loaded toolbar.js\n');
