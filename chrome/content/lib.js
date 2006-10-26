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

function GetFBSearchBox() {
  var box = top.document.getElementById('facebook-search');
  if (!box) {
    box = top.document.getElementById('sidebar').contentDocument.getElementById('facebook-search-sidebar');
  }
  return box;
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
    GetFBSearchBox().focus();
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
      window.setTimeout("SearchFriends(GetFBSearchBox().value)", waitTil - now);
      return;
  }
  */
  var sidebar = IsSidebarOpen();
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
    for (var i = 0; i < list.childNodes.length; i++) {
      var node = list.childNodes[i];
      var sname = node.getAttribute('friendname');
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
    for (var i = 0; i < list.childNodes.length; i++) {
      var node = list.childNodes[i];
      node.style.display = '';
      numDisplayed++;
      lastDisplayed = node;
    }
  }
  var item = list.selectedItem;
  if (item) {
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
      if (!document.getElementById('PopupMessager')) {
        debug('showing action links', lastDisplayed.id);
        var item = document.createElement('richlistitem');
        item.setAttribute('id', 'PopupMessager');
        item.setAttribute('class', 'facebook-friendlinks');
        item.setAttribute('value', 'Send ' + lastDisplayed.getAttribute('firstname') + ' a message');
        item.setAttribute('onmouseup', "this.doCommand();");
        item.setAttribute('onmouseover', "SelectItemInList(this, this.parentNode)");
        item.setAttribute('oncommand', "OpenFBUrl('message.php', '" + lastDisplayed.getAttribute('userid') + "', event)");
        list.appendChild(item);
        item = document.createElement('richlistitem');
        item.setAttribute('id', 'PopupPoker');
        item.setAttribute('class', 'facebook-friendlinks');
        item.setAttribute('value', 'Poke ' + lastDisplayed.getAttribute('firstname'));
        item.setAttribute('onmouseup', "this.doCommand();");
        item.setAttribute('onmouseover', "SelectItemInList(this, this.parentNode)");
        item.setAttribute('oncommand', "OpenFBUrl('poke.php', '" + lastDisplayed.getAttribute('userid') + "', event)");
        list.appendChild(item);
      }
    } else {
      var messager = document.getElementById('PopupMessager');
      if (messager) {
        var poker = document.getElementById('PopupPoker');
        if (list.selectedItem && (list.selectedItem == poker || list.selectedItem == messager)) {
          debug('unselecting');
          list.selectedItem = null;
        }
        list.removeChild(messager);
        list.removeChild(poker);
      }
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
                   encodeURIComponent(GetFBSearchBox().value), e);
      }
      // fall-through to hide the pop-up...
    case e.DOM_VK_ESCAPE:
      // for some reason calling blur() doesn't work here...lets just focus the browser instead
      content.focus();
      return;
  }
}

function MoveInList(dir) {
  var list = GetFriendsListElement();
  var item = list.selectedItem;
  if (!item || item.style.display == 'none') {
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
  while (item && item.style.display == 'none') {
    item = item[dir];
  }

  if (item) {
    SelectItemInList(item, list);
  }
}

function FacebookLogin() {
  if (fbSvc.loggedIn) {
    dump('logging out\n');
    fbSvc.sessionEnd();
  } else {
    // popup login page height is normally 436, but add 20 pixels for the
    // button we show at the bottom of the page
    window.open('chrome://facebook/content/login.xul', '',
                'chrome,centerscreen,width=626,height=456,modal=yes,dialog=yes,close=no');
  }
}

