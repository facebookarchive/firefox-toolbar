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
  e.stopPropagation();
}

function IsSidebarOpen() {
  return (top.document.getElementById('viewFacebookSidebar').getAttribute('checked') == 'true');
}

function GetFriendsListElement() {
  if (IsSidebarOpen()) {
    var list = top.document.getElementById('sidebar').contentDocument.getElementById('SidebarFriendsList');
  }
  if (!list) {
    var list = top.document.getElementById('PopupFacebookFriendsList');
  }
  return list;
}

function SelectItemInList(item, list) {
  if (!facebook) {
    // this must have been called via the sidebar
    list.selectedItem = item;
  } else {
    // for some reason, calling hidePopup followed by showPopup results in the popup being hidden!
    // so we need to disable the hidePopup call temporarily while the focus shifts around
    facebook.ignoreBlur = true;
    list.selectedItem = item;
    document.getElementById('facebook-search').focus();
    facebook.ignoreBlur = false;
  }
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
  var sidebar = IsSidebarOpen();
  if (sidebar) var childNodeName = 'richlistitem';
  else var childNodeName = 'vbox';
  var list = GetFriendsListElement();
  var numDisplayed = 0;
  var lastDisplayed = null;
  if (search) {
    var searches = [];
    for each (var s in search.split(/\s+/)) {
      if (s) {
        searches.push(new RegExp('\\b' + s, 'i'));
      }
    }
    for each (var node in list.childNodes) {
      if (node.nodeName != childNodeName) continue;
      var sname = node.getAttribute('searchname');
      if (!sname) continue;
      if (searches.every(function(s) { return s.test(sname); })) {
        node.style.display = '';
        numDisplayed++;
        lastDisplayed = node;
      } else {
        node.style.display = 'none';
      }
    }
  } else {
    // simple version for empty searches
    for each (var node in list.childNodes) {
      if (node.style) {
        node.style.display = '';
        numDisplayed++;
        lastDisplayed = node;
      }
    }
  }
  var item = list.selectedItem;
  if (item) {
    if (numDisplayed > 1 && !sidebar) {
      item = item.parentNode.firstChild; // in case it was on an action link
    }
    if (item.style.display == 'none') {
      list.selectedIndex = -1;
    } else {
      if (list.selectedItem != item) { // action link case again
        SelectItemInList(item, list);
      }
      list.ensureElementIsVisible(item);
    }
  }
  if (!sidebar) {
    if (numDisplayed == 1) {
      lastDisplayed.childNodes[1].style.display = '';
      lastDisplayed.childNodes[2].style.display = '';
      if (facebook) {
        facebook.actionLinksShowing = lastDisplayed;
      }
    } else if (facebook && facebook.actionLinksShowing) {
      facebook.actionLinksShowing.childNodes[1].style.display = 'none';
      facebook.actionLinksShowing.childNodes[2].style.display = 'none';
      facebook.actionLinksShowing = null;
    }
  }
}

function HandleKeyPress(e) {
  var list = GetFriendsListElement();
  switch (e.keyCode) {
    case e.DOM_VK_UP:
      MoveInList('previousSibling');
      e.stopPropagation();
      e.preventDefault();
      return;
    case e.DOM_VK_DOWN:
      MoveInList('nextSibling');
      e.stopPropagation();
      e.preventDefault();
      return;
    case e.DOM_VK_RETURN: // fall-through
    case e.DOM_VK_ENTER:
      var item = list.selectedItem;
      if (item && item.style.display != 'none') {
        item.doCommand();
      } else {
        openUILink('http://www.facebook.com/s.php?q=' +
                   encodeURIComponent(document.getElementById('facebook-search').value), e);
      }
      // fall-through to hide the pop-up...
    case e.DOM_VK_ESCAPE:
      // for some reason calling blur() doesn't work here...lets just focus the browser instead
      content.focus();
      return;
  }
}

function IsSelectableItem(item, childNodeName) {
  return (item && item.nodeName == childNodeName && item.style.display != 'none');
}

function MoveInList(dir) {
  var list = GetFriendsListElement();
  var sidebar = IsSidebarOpen();
  if (sidebar) var childNodeName = 'richlistitem';
  else var childNodeName = 'vbox';
  var item = list.selectedItem;
  if (item && !sidebar) item = item.parentNode;
  if (!IsSelectableItem(item, childNodeName)) {
    // nothing selected yet, start at the top...
    if (dir == 'previousSibling') {
      item = list.lastChild;
    } else {
      item = list.firstChild;
    }
  } else {
    // start by moving up/down one
    item = item[dir];
  }
  while (item && !IsSelectableItem(item, childNodeName)) {
    item = item[dir];
  }

  if (IsSelectableItem(item, childNodeName)) {
    if (sidebar) {
      SelectItemInList(item, list);
    } else {
      SelectItemInList(item.firstChild, list);
    }
  } else if (facebook && facebook.actionLinksShowing && list.selectedItem && list.selectedItem[dir]) {
    SelectItemInList(list.selectedItem[dir], list);
  }
}
