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

function SetHint(visible, text, oncommand) {
  debug(visible, text, oncommand);
  if (IsSidebarOpen()) {
    var doc = top.document.getElementById('sidebar').contentDocument;
  } else {
    var doc = document;
  }
  var hint = doc.getElementById('FacebookHint');
  if (hint) {
    if (visible) {
      hint.setAttribute('oncommand', oncommand);
      doc.getElementById('FacebookHintText').setAttribute('value', text);
      hint.style.display = '';
    } else {
      hint.style.display = 'none';
    }
  }
}

function SearchFriends(search) {
  debug('searching for: ' + search);
  var sidebar = IsSidebarOpen();
  var list = GetFriendsListElement();
  if (list.firstChild.id == 'FacebookHint') return; // not logged in
  var numMatched = 0;
  var lastDisplayed = null;
  var searches = [];
  if (search) {
    for each (var s in search.split(/\s+/)) {
      if (s) {
        searches.push(new RegExp('\\b' + s, 'i'));
      }
    }
  }
  for (var i = 0; i < list.childNodes.length; i++) {
    var node = list.childNodes[i];
    var sname = node.getAttribute('friendname');
    if (!sname) continue;
    if (!search || searches.every(function(s) { return s.test(sname); })) {
      if (sidebar || numMatched < 4) {
        node.style.display = '';
        lastDisplayed = node;
      } else {
        node.style.display = 'none';
      }
      numMatched++;
    } else {
      node.style.display = 'none';
    }
  }
  debug('matched', numMatched);
  if (search && numMatched == 0) {
    SetHint(true, 'Press enter to search for "' + search + '" on Facebook',
            "openUILink('http://www.facebook.com/s.php?q=' + encodeURIComponent(GetFBSearchBox().value), event);");
  } else if (!sidebar && numMatched > 4) {
    var str = 'See all ' + numMatched + ' friends'
      if (search) {
        str += ' matching "' + search + '"';
      }
    str += '...';
    SetHint(true, str, "toggleSidebar('viewFacebookSidebar');");
  } else {
    SetHint(false, '', '');
  }
  if (!sidebar) {
    if (numMatched == 1) {
      var msger = document.getElementById('PopupMessager');
      var poker = document.getElementById('PopupPoker');
      var poster = document.getElementById('PopupPoster');
      msger.setAttribute('userid', lastDisplayed.getAttribute('userid'));
      poker.setAttribute('userid', lastDisplayed.getAttribute('userid'));
      poster.setAttribute('userid', lastDisplayed.getAttribute('userid'));
      msger.setAttribute('value', 'Send ' + lastDisplayed.getAttribute('firstname') + ' a message');
      poker.setAttribute('value', 'Poke ' + lastDisplayed.getAttribute('firstname'));
      poster.setAttribute('value', 'Write on ' + lastDisplayed.getAttribute('firstname') + "'s wall");
      msger.style.display = '';
      poker.style.display = '';
      poster.style.display = '';
    } else {
      var msger = document.getElementById('PopupMessager');
      var poker = document.getElementById('PopupPoker');
      var poster = document.getElementById('PopupPoster');
      msger.style.display = 'none';
      poker.style.display = 'none';
      poster.style.display = 'none';
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
    var req = new XMLHttpRequest();
    req.open('post', 'http://www.facebook.com/logout.php')
    req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    req.send('confirm=1');
  } else {
    // popup login page height is normally 436, but add 20 pixels for the
    // button we show at the bottom of the page
    window.open('chrome://facebook/content/login.xul', '',
                'chrome,centerscreen,width=626,height=456,modal=yes,dialog=yes,close=no');
  }
}


function getStatusTime(status_time) {
   var currentTime = new Date();

   var updateTime = new Date;
   updateTime.setTime(status_time*1000);

   var days = new Array("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday");
   var day;

   // assumption that status messages are only shown if in the last 7 days
   if (updateTime.getDate() == currentTime.getDate()) {
     day = "Today";
   } else if ((updateTime.getDay() + 1) % 7 == currentTime.getDay()) {
     day = "Yesterday"; 
   } else {
     day = 'Last ' + days[updateTime.getDay()];
   }

   var hour = updateTime.getHours();
   if (hour > 11) timeOfDay = 'pm';
   else timeOfDay = 'am';

   var minute = updateTime.getMinutes();
   if (minute < 10) {
     minute = '0' + minute;
   }

   if (hour > 12) hour -= 12;
   stime = day + ' at ' + hour + ':' + minute + ' ' + timeOfDay;
   return stime;
}
