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

function debug() {
  if (debug.caller && debug.caller.name) {
    dump(debug.caller.name + ': ');
    logConsole(debug.caller.name + ': ');
  } else {
    dump(' ');
    //logConsole(' ');
  }
  for (var i = 0; i < arguments.length; i++) {
    if (i > 0) dump(', ');
    dump(arguments[i]);
    logConsole(arguments[i]);
  }
  dump('\n');
}

var SIDEBAR_AVAILABLE = !!window.toggleSidebar;

/* Log message to error console if enableLogging preference is true */
function logConsole (logMessage) {
    var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
    var debug = prefSvc.getBoolPref('extensions.facebook.debug');
    if (debug) {
        var now = new Date();
        //var logString = "Facebook Toolbar : " + " [" + now + "] " + " \"" + logMessage + "\"";
        var logString = "Facebook Toolbar : " + logMessage;

        // send a message to the console
        var consoleService = Cc['@mozilla.org/consoleservice;1'].
                getService(Ci.nsIConsoleService);
        consoleService.logStringMessage(logString);
    }
}

// wrapper for document.getElementById(id).setAttribute(attrib, val) that
// doesn't die if the elem doesn't exist.  useful for us since customize
// toolbar lets you remove a lot of elements.
function setAttributeById(id, attrib, val) {
    var el = document.getElementById(id);
    if (el) {
      el.setAttribute(attrib, val);
      return true;
    }
    return false;
}

function getAttributeById(id, attrib) {
    var el = document.getElementById(id);
    if (el) {
      return el.getAttribute(attrib);
    }
    return false;
}

function SetFacebookStatus(status) {
    if (fbSvc.canSetStatus) {
        fbSvc.setStatus(status.value);
        status.blur();
    } else {
        var authorizeUrl = "http://www.facebook.com/authorize.php?api_key="+fbSvc.apiKey
            +"&v=1.0&ext_perm=status_update";
        fbSvc.clearCanSetStatus();
        openUILink(authorizeUrl);
    }
    return false;
}

function OpenFBUrl(page, uid, e, params) {
  var url = 'http://www.facebook.com/' + page + '?id=' + uid + '&src=fftb';
  if (uid == "events")
    url = 'http://www.facebook.com/?sk=events&src=fftb';
  if( params ) {
    for ( var param in params ) {
        url += '&' + param + '=';
        if( null != params[params] ) url += params[param];
    }
  }
  debug('Opening ' + url);
  openUILink(url, e);
  e.stopPropagation();
  return false;
}

function IsSidebarOpen() {
  return SIDEBAR_AVAILABLE &&
    (top.document.getElementById('viewFacebookSidebar').getAttribute('checked') == 'true');
}

function GetFriendsListElement() {
  var list = IsSidebarOpen()
      ? top.document.getElementById('sidebar').contentDocument.getElementById('SidebarFriendsList')
      : null;
  return list || top.document.getElementById('PopupFacebookFriendsList');
}

function GetFBSearchBox() {
  var box = top.document.getElementById('facebook-search');
  if (!box && SIDEBAR_AVAILABLE) {
    box = top.document.getElementById('sidebar').contentDocument.getElementById('facebook-search-sidebar');
  }
  return box;
}

function SelectItemInList(item, list) {
  if (!facebook) {
    // this must have been called via the sidebar
    list.selectedItem = item;
  } else {
    // for some reason, calling hidePopup followed by showPopup
    // results in the popup being hidden!
    // so we need to disable the hidePopup call temporarily while the
    // focus shifts around
    facebook.ignoreBlur = true;
    list.selectedItem = item;
    GetFBSearchBox().focus();
    facebook.ignoreBlur = false;
  }
}

function SetSpecificHint(doc, visible, text, oncommand) {
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

function SetHint(visible, text, oncommand) {
  if (IsSidebarOpen()) {
    var doc = top.document.getElementById('sidebar').contentDocument;
    SetSpecificHint(doc, visible, text, oncommand);
  }
  SetSpecificHint(document, visible, text, oncommand);
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
      if (sidebar || (numMatched < 4 && search)) {
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
            "openUILink('http://www.facebook.com/search/?src=fftb&q=' + encodeURIComponent(GetFBSearchBox().value), event);");
  } else if (!sidebar && (numMatched > 4 || !search)) {
    var str = 'See all ' + numMatched + ' friends';
    if (search)
      str += ' matching "' + search + '"';
    str += '...';
    SetHint(true, str, "toggleSidebar('viewFacebookSidebar');");
  } else {
    SetHint(false, '', '');
  }
  if (!sidebar) {
      var msger = document.getElementById('PopupMessager'),
          poker = document.getElementById('PopupPoker'),
          poster = document.getElementById('PopupPoster');
      if (1 == numMatched) {
          var uid = lastDisplayed.getAttribute('userid'),
              firstname = lastDisplayed.getAttribute('firstname');
          msger.setAttribute('userid', uid );
          msger.setAttribute('value', 'Send ' + firstname + ' a message');

          poker.setAttribute('userid', uid );
          poker.setAttribute('value', 'Poke ' + firstname );

          poster.setAttribute('userid', uid);
          poster.setAttribute('value', 'Write on ' + firstname + "'s wall");

          msger.style.display = poker.style.display = poster.style.display = '';
      } else {
          msger.style.display = poker.style.display = poster.style.display = 'none';
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
        openUILink('http://www.facebook.com/search/?src=fftb&q=' +
                   encodeURIComponent(GetFBSearchBox().value), e);
      }
      // fall-through to hide the pop-up...
    case e.DOM_VK_ESCAPE:
      // for some reason calling blur() doesn't work here...lets just
      // focus the browser instead
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

    // Some methods require us to get the wrapped object (namely getCommonParams())
    var facebookSvc =  Cc['@facebook.com/facebook-service;1'].
                 	getService(Ci.fbIFacebookService).
                	wrappedJSObject;

    var req = new XMLHttpRequest();
    req.open('post', 'http://www.facebook.com/toolbar_logout.php');
    req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    req.send('api_key=' + facebookSvc.apiKey + 
	     '&uid=' + facebookSvc.loggedInUser.id + 
	     '&session_key=' + facebookSvc.getCommonParams().session_key);
    fbSvc.sessionEnd();
  } else {
    // popup login page height is at most 500, but add 20 pixels for the
    // button we show at the bottom of the page
    window.open('chrome://facebook/content/login.xul', '',
                'chrome,centerscreen,width=646,height=520,modal=yes,dialog=yes,close=yes');
  }
}

function RenderStatusMsg(msg) {
    msg = msg.replace(/\s*$/g, '');
    if (msg && '.?!\'"'.indexOf(msg[msg.length-1]) == -1) {
        msg = msg.concat('.');
    }
    return msg;
}

function SetProfileTime(item, time){
  item.setAttribute('ptime',getProfileTime(time));
}

function SetStatus(item, status, time) {
    if (status) {
        var firstName = item.getAttribute('firstname');
        var msg = firstName + ' ' + RenderStatusMsg(status);
        if (item.firstChild) {
            item.firstChild.nodeValue = msg;
        } else {
            item.appendChild(document.createTextNode(msg));
        }
        item.setAttribute('stime', getStatusTime(time));
    } else {
        if (item.firstChild) {
            item.removeChild(item.firstChild);
        }
        item.removeAttribute('stime');
    }
}

function DatesInSeconds() {
  this.minute  = 60;
  this.two_mins= 120;
  this.hour    = 60*this.minute;
  this.hour_and_half = 90*this.minute;
  this.day     = 24*this.hour;
  this.week    = 7*this.day;
  this.month   = 30.5*this.day;
  this.year    = 365*this.day;
}
var dates_in_seconds = new DatesInSeconds();

/*
 * Render a short version of the date depending on how close it is to today's date
 * @param time - time in seconds from epoch
 * XXX - If this comes back to life, make sure it is locale friendly
 */
/*
function getRelativeTime(time) {
  var elapsed   = Math.floor(new Date().getTime()/1000) - time;
  if (elapsed <= 1)
    return 'a moment ago';
  if (elapsed < dates_in_seconds.minute)
    return elapsed.toString() + ' seconds ago';
  if (elapsed < 2*dates_in_seconds.two_mins)
    return 'one minute ago';
  if (elapsed < dates_in_seconds.hour)
    return Math.floor(elapsed/dates_in_seconds.minute) + ' minutes ago';
  if (elapsed < dates_in_seconds.hour_and_half)
    return 'about an hour ago';
  if (elapsed < dates_in_seconds.day )
    return Math.round(elapsed/dates_in_seconds.hour) + ' hours ago';
  if (elapsed < dates_in_seconds.week) {
    var days    = new Array( "Sunday", "Monday", "Tuesday", "Wednesday",
                             "Thursday", "Friday", "Saturday" );
    var d       = new Date;
    d.setTime(time*1000);
    return 'on ' + days[d.getDay()];
  }
  if (elapsed < dates_in_seconds.week*1.5)
    return 'about a week ago';
  if (elapsed < dates_in_seconds.week*3.5)
    return 'about ' + Math.round(elapsed/dates_in_seconds.week) + ' weeks ago';
  if (elapsed < dates_in_seconds.month*1.5)
    return 'about a month ago';
  if (elapsed < dates_in_seconds.year)
    return 'about ' + Math.round(elapsed/dates_in_seconds.month) + ' months ago';
  return 'over a year ago';
}*/

function getRelTime(time, isProfile) {
  var sbundle = GetFBStringBundle();
  var elapsed   = Math.floor(new Date().getTime()/1000) - time;
  if( elapsed < dates_in_seconds.week )
    return getRelTimeWithinWeek(time, false, isProfile);
  if (elapsed < dates_in_seconds.week*1.5)
    return sbundle.getString('aboutaweekago');
  if (elapsed < dates_in_seconds.week*3.5) {
    var weeksElapsed = Math.round(elapsed/dates_in_seconds.week);
    if (weeksElapsed == 2)
      return sbundle.getString('abouttwoweeksago');
    else
      return sbundle.getFormattedString('aboutweeksago', [weeksElapsed]);
  }
  if (elapsed < dates_in_seconds.month*1.5)
    return sbundle.getString('aboutamonthago');
  return ''; //XX Brian - Why are we returning here?

  if (elapsed < dates_in_seconds.year) {
    var monthsElapsed = Math.round(elapsed/dates_in_seconds.month);
    if (monthsElapsed == 2)
      return sbundle.getString('abouttwomonthsago');
    else
      return sbundle.getFormattedString('aboutmonthsago', [monthsElapsed]);
  }
  return sbundle.getString('overayear');
}

function getProfileTime(profile_time) {
  var relative_time = getRelTime(profile_time, true);
  var sbundle = GetFBStringBundle();
  var updatedProfileTime = sbundle.getFormattedString('updatedProfileTime', [relative_time]);
  return relative_time ? updatedProfileTime : '';
}

function getRelTimeWithinWeek(time, initialCap, isProfile) {
  var currentTime = new Date;

  var updateTime = new Date;
  updateTime.setTime(time*1000);

  var sbundle = GetFBStringBundle();

  var mon, tues, wed, thurs, fri, sat, sun;
  if (isProfile) {
    mon = sbundle.getString('mondayInSentence');
    tues = sbundle.getString('tuesdayInSentence');
    wed = sbundle.getString('wednesdayInSentence');
    thurs = sbundle.getString('thursdayInSentence');
    fri = sbundle.getString('fridayInSentence');
    sat = sbundle.getString('saturdayInSentence');
    sun = sbundle.getString('sundayInSentence');
  }
  else {
    mon = sbundle.getString('monday');
    tues = sbundle.getString('tuesday');
    wed = sbundle.getString('wednesday');
    thurs = sbundle.getString('thursday');
    fri = sbundle.getString('friday');
    sat = sbundle.getString('saturday');
    sun = sbundle.getString('sunday');
  }
  var yesterday = sbundle.getString('yesterday');
  var yesterdayic = sbundle.getString('yesterdayic');
  var today = sbundle.getString('today');
  var todayic = sbundle.getString('todayic');
  var days = new Array(sun, mon, tues, wed, thurs, fri, sat);
  var day;
  var recently = true;

  // assumption that status messages are only shown if in the last 7 days
  if (updateTime.getDate() == currentTime.getDate()) {
    day = initialCap ? todayic : today;
  } else if ((updateTime.getDay() + 1) % 7 == currentTime.getDay()) {
    day = initialCap ? yesterdayic : yesterday;
  } else {
    day = days[updateTime.getDay()];
    recently = false;
  }

  var hour = updateTime.getHours();

  var minute = updateTime.getMinutes();
  if (minute < 10) {
    minute = '0' + minute;
  }

  var tstr;
  if (recently)
    tstr = sbundle.getFormattedString('timeStringRecent', [day, hour, minute]);
  else
    tstr = sbundle.getFormattedString('timeStringDay', [day, hour, minute]);

  return tstr;
}

function getStatusTime(status_time) {
  return getRelTimeWithinWeek(status_time, true, false);
}

/**
 * This is called on _every_ page loaded in Firefox
 * and tests whether it's a Facebook URL. So it better be as
 * efficient as possible
 */
function IsFacebookLocation(location) {
  if( location && location.schemeIs // use to detect nsIURI
    && ( location.schemeIs("http") || location.schemeIs("https") ) ) {
    var len = location.host.length;
    return (len>=12) && ("facebook.com" == location.host.substring(len-12));
  }
  return false;
}

// Toggles the toolbar
function facebook_toggleToolbar()
{ /* modelled on webdeveloper toolbar behavior */
    var toolbar = document.getElementById("facebook-toolbar");
    toolbar.collapsed = !toolbar.collapsed;
    document.persist("facebook-toolbar", "collapsed");
}

function GetFBStringBundle() {
  var sb = document.getElementById('facebook-strings');
  if (!sb && SIDEBAR_AVAILABLE) {
    debug( "getting bundle from sidebar..." );
    sb = document.getElementById('sidebar').contentDocument.getElementById('facebook-strings');
  }
  return sb;
}
