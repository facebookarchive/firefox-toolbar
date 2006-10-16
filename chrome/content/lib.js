var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);

function debug() {
  if (debug.caller && debug.caller.name) {
    dump(debug.caller.name + ':\t');
  } else {
    dump('\t\t');
  }
  for (var i = 0; i < arguments.length; i++) {
    if (i > 0) dump(', ');
    dump(arguments[i]);
  }
  dump('\n');
}

function OpenFBUrl(page, uid, e) {
  var url = 'http://www.facebook.com/' + page + '?uid=' + uid + '&api_key=' + fbSvc.apiKey;
  debug('Opening ' + url);
  openUILink(url, e);
}

function GetFriendsListElement() {
  if (top.document.getElementById('viewFacebookSidebar').getAttribute('checked') == 'true') {
    var list = top.document.getElementById('sidebar').contentDocument.getElementById('SidebarFriendsList');
  }
  if (!list) {
    var list = top.document.getElementById('PopupFacebookFriendsList');
  }
  return list;
}

function SearchFriends(search) {
  search = search.toLowerCase();
  debug('searching for: ' + search);
  /* this would delay searching until a given time after the last key was
   * typed so that we don't burn cpu searching when the user's still typing.
  var now = (new Date()).getTime();
  if (waitTil > now) {
      debug('still waiting');
      window.setTimeout("SearchFriends(top.document.getElementById('facebook-search').value)", waitTil - now);
      return;
  }
  */
  var list = GetFriendsListElement();
  if (search) {
    var searches = [];
    for each (var s in search.split(/\s+/)) {
      if (s) {
        searches.push(new RegExp('\\b' + s, 'i'));
      }
    }
    for each (var node in list.childNodes) {
      if (node.nodeName != 'richlistitem') continue;
      var sname = node.getAttribute('searchname');
      if (!sname) continue;
      if (searches.every(function(s) { return s.test(sname); })) {
        node.style.display = '';
      } else {
        node.style.display = 'none';
      }
    }
  } else {
    // simple version for empty searches
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
}
