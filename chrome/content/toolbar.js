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
        facebook.loadFriends();
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
    dump('go_url(' + url + ')\n');
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
    if (document.getElementById('viewFacebookSidebar').getAttribute('checked') == 'true') {
      var list = document.getElementById('sidebar').contentDocument.getElementById('fList');
    }
    if (!list) {
      var list = document.getElementById('PopupFacebookFriendsList');
    }
    if (search) {
      var searches = [];
      for each (var s in search.split(/\s+/)) {
        if (s) {
          searches.push(new RegExp('\\b' + s, 'i'));
        }
      }
      for each (var node in list.childNodes) {
        var sname = node.getAttribute('searchname');
        if (sname) {
          var match = true;
          for each (var s in searches) {
            if (!s.test(sname)) {
              match = false;
              break;
            }
          }
          if (match) {
            node.style.display = '';
          } else {
            node.style.display = 'none';
          }
        }
      }
    } else {
      for each (var node in list.childNodes) {
        if (node.style) {
          node.style.display = '';
        }
      }
    }
    var item = list.selectedItem;
    if (item) {
      if (item.style.display == 'none') {
        list.selectedIndex = -1;
      } else {
        list.ensureElementIsVisible(item);
      }
    }
  },
  searchKeyPress: function(searchBox, e) {
    if (document.getElementById('viewFacebookSidebar').getAttribute('checked') == 'true') {
      var list = document.getElementById('sidebar').contentDocument.getElementById('fList');
    }
    if (!list) {
      var list = document.getElementById('PopupFacebookFriendsList');
    }
    switch (e.keyCode) {
      case e.DOM_VK_UP:
        var prop = 'previousSibling';
        break;
      case e.DOM_VK_DOWN:
        var prop = 'nextSibling';
        break;
      case e.DOM_VK_RETURN: // fall-through
      case e.DOM_VK_ENTER:
        var item = list.selectedItem;
        if (item) {
          this.go_url('http://www.facebook.com/profile.php?uid=' + item.getAttribute('userid') +
                      '&api_key=' + fbSvc.apiKey);
        } else {
          this.go_url('http://www.facebook.com/s.php?q=' + encodeURIComponent(searchBox.value));
        }
        // fall-through to hide the pop-up...
      case e.DOM_VK_ESCAPE:
        // for some reason calling blur() doesn't work here...lets just focus the browser instead
        document.getElementById('content').selectedBrowser.focus();
        return;
    }

    if (prop) {
      var item = list.selectedItem;
      if (!item) {
        if (prop == 'previousSibling') {
          item = list.lastChild;
        } else {
          item = list.firstChild;
        }
      } else {
        do {
          item = item[prop];
        } while (item && item.style.display == 'none');
      }
      if (item && item.nodeName == 'richlistitem') {
        // for some reason, calling hidePopup followed by showPopup results in the popup being hidden!
        // so we need to disable the hidePopup call temporarily while the focus shifts around
        this.ignoreBlur = true;
        list.selectedItem = item;
        searchBox.focus();
        this.ignoreBlur = false;
      }
    }
  }
};
window.addEventListener('load', facebook.load, false);
window.addEventListener('unload', facebook.unload, false);

dump('loaded toolbar.js\n');
