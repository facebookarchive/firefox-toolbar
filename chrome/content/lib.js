/**
 *
 * The source code included in this file is licensed to you by Facebook under
 * the Apache License, Version 2.0.  Accordingly, the following notice
 * applies to the source code included in this file:
 *
 * Copyright © 2012 Facebook, Inc.
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

var fbLib = {

    SIDEBAR_AVAILABLE: !!window.toggleSidebar,
    TypeaheadSearchTimeout: 0,
    TypeaheadSearchLastSearch: "",

    debug: function() {
      if (fbLib.debug.caller && fbLib.debug.caller.name) {
        dump(fbLib.debug.caller.name + ': ');
        fbLib.logConsole(fbLib.debug.caller.name + ': ');
      } else {
        dump(' ');
        //fbLib.logConsole(' ');
      }
      for (var i = 0; i < arguments.length; i++) {
        if (i > 0) dump(', ');
        dump(arguments[i]);
        fbLib.logConsole(arguments[i]);
      }
      dump('\n');
    },

    /* Log message to error console if enableLogging preference is true */
    logConsole: function(logMessage) {
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
    },

    // wrapper for document.getElementById(id).setAttribute(attrib, val) that
    // doesn't die if the elem doesn't exist.  useful for us since customize
    // toolbar lets you remove a lot of elements.
    setAttributeById: function(id, attrib, val) {
        var el = document.getElementById(id);
        if (el) {
          el.setAttribute(attrib, val);
          return true;
        }
        return false;
    },

    getAttributeById: function(id, attrib) {
        var el = document.getElementById(id);
        if (el) {
          return el.getAttribute(attrib);
        }
        return false;
    },

    removeAttributeById: function(id, attrib) {
        var el = document.getElementById(id);
        if (el) {
          return el.removeAttribute(attrib);
        }
        return false;
    },

    SetFacebookStatus: function(status) {
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
    },

    OpenNewStyleFBUrl: function(page, uid, e) {
      var url = 'http://www.facebook.com/' + page + '/' + uid;
      fbLib.debug('Opening ' + url);
      openUILink(url, e);
      e.stopPropagation();
      return false;
    },

    OpenFBUrl: function(page, uid, e, params) {
      var url = 'http://www.facebook.com/' + page + '?id=' + uid + '&src=fftb';
      if (uid == "events")
        url = 'http://www.facebook.com/?sk=events&src=fftb';
      if( params ) {
        for ( var param in params ) {
            url += '&' + param + '=';
            if( null != params[params] ) url += params[param];
        }
      }
      fbLib.debug('Opening ' + url);
      openUILink(url, e);
      e.stopPropagation();
      return false;
    },

    IsSidebarOpen: function() {
      return fbLib.SIDEBAR_AVAILABLE &&
        (top.document.getElementById('viewFacebookSidebar').getAttribute('checked') == 'true');
    },

    GetFriendsListElement: function() {
      var list = fbLib.IsSidebarOpen()
          ? top.document.getElementById('sidebar').contentDocument.getElementById('SidebarFriendsList')
          : null;
      return list || top.document.getElementById('PopupFacebookFriendsList');
    },

    GetASearchResultsElement: function(id) {
      var list = fbLib.IsSidebarOpen()
          ? top.document.getElementById('sidebar').contentDocument.getElementById(id)
          : null;
      return list || top.document.getElementById(id);
    },

    GetFBSearchBox: function() {
      var box = top.document.getElementById('facebook-search');
      if (!box && fbLib.SIDEBAR_AVAILABLE) {
        box = top.document.getElementById('sidebar').contentDocument.getElementById('facebook-search-sidebar');
      }
      return box;
    },

    SelectItemInList: function(item, list) {
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
        fbLib.GetFBSearchBox().focus();
        facebook.ignoreBlur = false;
      }
      list.ensureElementIsVisible(list.selectedItem);
    },

    SetSpecificHint: function(doc, visible, text, oncommand) {
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
    },

    SetHint: function(visible, text, oncommand) {
      if (fbLib.IsSidebarOpen()) {
        var doc = top.document.getElementById('sidebar').contentDocument;
        fbLib.SetSpecificHint(doc, visible, text, oncommand);
      }
      fbLib.SetSpecificHint(document, visible, text, oncommand);
    },

    TypeaheadSearchFriendsOnly: function(search) {

        fbLib.SearchFriends(search);

        var headers = document.getElementsByClassName('facebook-listheader');

        for (var i=0; i<headers.length; i++)
        {
            headers[i].collapsed = true;
            headers[i].style.display = 'none';
        }

        var searchAll = fbLib.GetASearchResultsElement("FacebookSearchAll");

        if (search)
        {
            var sbundle = fbLib.GetFBStringBundle();
            var str = sbundle.getFormattedString('searchEnter', [search]);
            fbLib.GetASearchResultsElement("FacebookSearchAllText").setAttribute("value", str);
            searchAll.setAttribute("oncommand", "openUILink('http://www.facebook.com/search/?src=fftb&q=' + encodeURIComponent(fbLib.GetFBSearchBox().value), event);");
            searchAll.collapsed = false;
        }
        else
        {
            searchAll.collapsed = true;
        }
    },

    TypeaheadSearchExtensionService: function(search) {

        // This is no longer supported by Facebook, defaulting to Friends only
        fbLib.TypeaheadSearchFriendsOnly(search);
        return;

        var list = fbLib.GetFriendsListElement();
        var sidebar = fbLib.IsSidebarOpen();

        if (search != "" && search == fbLib.TypeaheadSearchLastSearch)
            return;

        if (fbLib.TypeaheadSearchTimeout)
            clearTimeout(fbLib.TypeaheadSearchTimeout);

        list.selectedIndex = -1;

        while (list.getElementsByAttribute("class", "facebook-search-result").length > 0)
        {
            list.removeChild(list.getElementsByAttribute("class", "facebook-search-result")[0]);
        }

        var listHeaderOther = fbLib.GetASearchResultsElement("facebook-listheader-other");
        listHeaderOther.collapsed = true;
        listHeaderOther.style.display = 'none';

        var searchAll = fbLib.GetASearchResultsElement("FacebookSearchAll");
        searchAll.parentNode.insertBefore(searchAll, searchAll.parentNode.firstChild);

        if (search)
        {
            var sbundle = fbLib.GetFBStringBundle();
            var str = sbundle.getFormattedString('searchEnter', [search]);
            fbLib.GetASearchResultsElement("FacebookSearchAllText").setAttribute("value", str);
            searchAll.setAttribute("oncommand", "openUILink('http://www.facebook.com/search/?src=fftb&q=' + encodeURIComponent(fbLib.GetFBSearchBox().value), event);");
            searchAll.collapsed = false;
        }
        else
        {
            searchAll.collapsed = true;
        }

        fbLib.TypeaheadSearchTimeout = setTimeout(function()
        {
            fbLib.TypeaheadSearchTimeout = 0;

            var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                .createInstance(Components.interfaces.nsIXMLHttpRequest);
            req.onreadystatechange = function(e)
            {
                try
                {
                    if (req.readyState != 4) { return; }

                    fbLib.debug("finished search call, status = " + req.status);

                    if (req.status != 200)
                        return;

                    var response = req.responseText.replace(/for \(;;\);/,'');

                    fbLib.debug("finished search call, response = " + response);

                    var data = JSON.parse(response);

                    if (!data[1])
                    {
                        throw "no data";
                    }

                    fbLib.TypeaheadSearchLastSearch = search;

                    if (!sidebar)
                        facebook.searchBoxFocus(document.getElementById('facebook-search'));

                    var doc = (sidebar?top.document.getElementById('sidebar').contentDocument:top.document);
                    var resultC = 0;

                    for (var i=0;i<data[1].length;i++)
                    {
                        if (list.getElementsByAttribute("friendname", data[1][i]).length>0)
                            continue;

                        if (!sidebar && resultC>=5)
                            break;

                        var item = doc.createElement("richlistitem");
                        item.setAttribute("class", "facebook-search-result");

                        if (!sidebar)
                            item.setAttribute('onmouseover', "fbLib.SelectItemInList(this, this.parentNode)");

                        item.setAttribute("name", data[1][i]);
                        item.setAttribute("oncommand", "openUILink('" + data[3][i] + "')");
                        item.setAttribute("pic", data[4][i]);
                        item.appendChild(doc.createTextNode(data[2][i]));

                        list.appendChild(item);

                        resultC++;
                    }

                    if (resultC)
                    {
                        list.insertBefore(searchAll, list.firstChild);
                        listHeaderOther.collapsed = false;
                        listHeaderOther.style.display = 'block';
                    }
                }
                catch (e)
                {
                    fbLib.debug("search error: " + e);
                    return;
                }
            };

            var method = "http://www.facebook.com/search/extension_typeahead.php?max=20&q="+encodeURIComponent(search);
            fbLib.debug("initiating search call, request = " + method);

            req.open("GET", method, true);
            req.send(null);
        }, 1000);

        fbLib.SearchFriends(search);
        document.getElementById("facebook-listheader-user").collapsed = true;
        document.getElementById("facebook-listheader-user").style.display = 'none';
    },

    TypeaheadSearchGraphAPI: function(search) {

        fbLib.debug("in typeaheadsearch with: " + search);

        if (search != "" && search == fbLib.TypeaheadSearchLastSearch)
            return;

        if (fbLib.TypeaheadSearchTimeout)
            clearTimeout(fbLib.TypeaheadSearchTimeout);

        var list = fbLib.GetFriendsListElement();

        list.selectedIndex = -1;

        while (list.getElementsByAttribute("class", "facebook-search-result").length > 0)
        {
            list.removeChild(list.getElementsByAttribute("class", "facebook-search-result")[0]);
        }

        var headers = list.getElementsByAttribute("class", "facebook-listheader");
        for (var i=0; i<headers.length; i++)
        {
            headers[i].collapsed = true;
            headers[i].style.display = 'none';
            headers[i].disabled = true;
        }

        var searchAll = fbLib.GetASearchResultsElement("FacebookSearchAll");

        searchAll.parentNode.insertBefore(searchAll, searchAll.parentNode.firstChild);

        if (search)
        {
            var sbundle = fbLib.GetFBStringBundle();
            var str = sbundle.getFormattedString('searchEnter', [search]);
            fbLib.GetASearchResultsElement("FacebookSearchAllText").setAttribute("value", str);
            searchAll.setAttribute("oncommand", "openUILink('http://www.facebook.com/search/?src=fftb&q=' + encodeURIComponent(fbLib.GetFBSearchBox().value), event);");
            searchAll.collapsed = false;
        }
        else
        {
            searchAll.collapsed = true;
        }

        fbLib.TypeaheadSearchTimeout = setTimeout(function()
        {
            fbLib.TypeaheadSearchTimeout = 0;

            var sidebar = fbLib.IsSidebarOpen();

            var graphSearch = function(q, type)
            {
                var headerElem = fbLib.GetASearchResultsElement("facebook-listheader-" + type);

                var callback = function(response)
                {
                    if (!response.data || response.data.length == 0)
                        return;

                    fbLib.TypeaheadSearchLastSearch = search;

                    if (!sidebar)
                        facebook.searchBoxFocus(document.getElementById('facebook-search'));

                    headerElem.collapsed = false;
                    headerElem.style.display = 'block';

                    var c=-1;

                    // create richlistitems with response's name and id
                    for (var i=0; i<response.data.length; i++)
                    {
                        if ((sidebar?top.document.getElementById('sidebar').contentDocument:top.document).getElementById("facebook-search-result-" + response.data[i].id))
                        {
                            c++;
                            continue;
                        }

                        var item = (sidebar?top.document.getElementById('sidebar').contentDocument:top.document).createElement("richlistitem");
                        item.setAttribute("id", "facebook-search-result-" + response.data[i].id);
                        item.setAttribute("class", "facebook-search-result");
                        item.setAttribute("type", type);

                        if (!sidebar)
                        item.setAttribute('onmouseover', "fbLib.SelectItemInList(this, this.parentNode)");

                        item.setAttribute("name", response.data[i].name);

                        if (sidebar)
                        {
                            item.setAttribute("style", "max-width: " + (top.document.getElementById('sidebar').contentWindow.innerWidth-10) + "px; overflow: hidden;");

                            // ALSO TODO: hide sort options if have search results?
                        }

                        // if type == 'user', don't re-add existing friends
                        if (type == 'user' && fbLib.GetASearchResultsElement('sidebar-' + response.data[i].id))
                            continue;

                        c++;

                        item.collapsed = true;

                        // add to richlistbox under header
                        if (type == 'user')
                            list.insertBefore(item, fbLib.GetASearchResultsElement("facebook-listheader-page"));
                        else
                            list.insertBefore(item, headerElem.nextSibling);

                        searchAll.parentNode.insertBefore(searchAll, searchAll.parentNode.firstChild);

                        fbSvc.wrappedJSObject.fetchGraphObject(response.data[i].id, null, function(obj)
                        {
                            var searchResult =
                                (sidebar?top.document.getElementById('sidebar').contentDocument:top.document).getElementById(
                                    "facebook-search-result-" + obj.id);

                            if (obj.link && obj.link.indexOf("facebook.com")>-1)
                                searchResult.setAttribute("oncommand","openUILink('" + obj.link + "')");
                            else
                                searchResult.setAttribute("oncommand","fbLib.OpenFBUrl('" + obj.id + "')");

                            if (obj.picture)
                                searchResult.setAttribute("pic",obj.picture);
                            else if (obj.icon)
                                searchResult.setAttribute("pic",obj.icon);
                            else
                                searchResult.nopic();

                            var desc = "";

                            if (obj.description)
                                desc = obj.description;
                            else if (obj.bio)
                                desc = obj.bio;

                            if (desc)
                            {
                                if (desc.length > 100)
                                    desc = desc.substring(0, 100) + "...";
                                searchResult.appendChild((sidebar?top.document.getElementById('sidebar').contentDocument:top.document).createTextNode(desc));
                            }

                            searchResult.collapsed = false;

                        });

                        // if sidebar, add 5. if popup, just add first
                        if (/*!sidebar || */c>=4)
                            break;

                    }

                    if (!sidebar)
                        fbLib._maxSizePopupFacebookFriendsList();
                };

                fbSvc.wrappedJSObject.fetchGraphObject("search", {"q": q, "type": type}, callback);
            };

            if (sidebar)
                graphSearch(search, "user");

            graphSearch(search, "page");
            graphSearch(search, "event");
            graphSearch(search, "group");
            graphSearch(search, "place");

        }, 1000);

        fbLib.SearchFriends(search);
    },

    searchBoxSelect: function(event)
    {
        return;
        fbLib.debug("in searchBoxSelect");
        var list = fbLib.GetFriendsListElement();
        if (list.selectedItem && list.selectedItem.getAttribute("class") == "facebook-listheader")
        {
            list.selectedItem = list.selectedItem.nextSibling;
        }
    },

    SearchFriends: function(search) {
      fbLib.debug('searching for: ' + search);
      var sbundle = fbLib.GetFBStringBundle();
      var sidebar = fbLib.IsSidebarOpen();
      var list = fbLib.GetFriendsListElement();

      if (!sidebar)
          list.setAttribute("height", "19px");

      if (!fbSvc.loggedIn) return;

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
      fbLib.debug('matched: ' + numMatched);
      if (numMatched > 0)
      {
          document.getElementById("facebook-listheader-user").collapsed = false;
          document.getElementById("facebook-listheader-user").style.display = 'block';
      }
      if (search && numMatched == 0) {
        /*
        var str = sbundle.getFormattedString('searchEnter', [search]);
        fbLib.SetHint(true, str,
                "openUILink('http://www.facebook.com/search/?src=fftb&q=' + encodeURIComponent(fbLib.GetFBSearchBox().value), event);");
        */
        fbLib.SetHint(false, '', '');
      } else if (!sidebar && (numMatched > 4 || !search)) {
        var str = sbundle.getFormattedString('allFriends', [numMatched]);
        if (search) {
          str = sbundle.getFormattedString('allFriendsMatching', [numMatched, search]);
        }
        else {
          document.getElementById("facebook-listheader-user").collapsed = true;
          document.getElementById("facebook-listheader-user").style.display = 'none';
        }
        fbLib.SetHint(true, str, "toggleSidebar('viewFacebookSidebar');");
      } else {
        fbLib.SetHint(false, '', '');
      }

      if (!sidebar) {

          try
          {
              var msger = document.getElementById('PopupMessager'),
                  poster = document.getElementById('PopupPoster');
              if (1 == numMatched) {
                  var uid = lastDisplayed.getAttribute('userid'),
                      firstname = lastDisplayed.getAttribute('firstname');
                  msger.setAttribute('userid', uid );
                  msger.setAttribute('value', sbundle.getFormattedString('sendMessage', [firstname]));

                  poster.setAttribute('userid', uid);
                  poster.setAttribute('value', sbundle.getFormattedString('wallMessage', [firstname]));

                  msger.style.display = poster.style.display = '';
              } else {
                  msger.style.display = poster.style.display = 'none';
              }
          } catch (e) {}
      }
      var item = list.selectedItem;
      if (item) {
        if (item.style.display == 'none') {
          list.selectedIndex = -1;
        } else {
          list.ensureElementIsVisible(item);
        }
      }


      if (!sidebar) {
          fbLib._maxSizePopupFacebookFriendsList();
      }

    },

    _maxSizePopupFacebookFriendsList: function()
    {
        var list = top.document.getElementById('PopupFacebookFriendsList');
        var style = window.getComputedStyle(list, null);

        var anonChildren = list.ownerDocument.getAnonymousNodes(list);
        var realh;

        for (var i = 0; i < anonChildren.length; i++)
        {
            if (anonChildren[i].nodeType == 1)
            {
                anonChildren[i].setAttribute("style", "overflow-x: hidden; overflow-y: auto;");
                var anonChildren2 = list.ownerDocument.getAnonymousNodes(anonChildren[i]);

                for (var j = 0; j < anonChildren2.length; j++)
                {
                    if (anonChildren2[j].nodeType == 1)
                    {
                        var style2 = window.getComputedStyle(anonChildren2[j], null);
                        realh = style2.getPropertyValue("height");
                    }
                }
            }
        }

        if (realh)
        {
            realh = parseInt(realh.substring(0, realh.indexOf("px")));

            if (realh > 600)
            {
                realh = 600;
            }

            list.setAttribute("height", (realh + 2) + "px");
            top.document.getElementById('PopupFacebookFriends').sizeTo("300", (realh + 20));
        }

    },

    HandleKeyPress: function(e) {
      var list = fbLib.GetFriendsListElement();
      switch (e.keyCode) {
        case e.DOM_VK_UP:
          fbLib.MoveInList('previousSibling');
          if (list.selectedItem && list.selectedItem.getAttribute("class") == "facebook-listheader")
              fbLib.MoveInList('previousSibling');
          e.stopPropagation();
          e.preventDefault();
          return;
        case e.DOM_VK_DOWN:
          fbLib.MoveInList('nextSibling');
          if (list.selectedItem && list.selectedItem.getAttribute("class") == "facebook-listheader")
              fbLib.MoveInList('nextSibling');
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
                       encodeURIComponent(fbLib.GetFBSearchBox().value), e);
          }
          // fall-through to hide the pop-up...
        case e.DOM_VK_ESCAPE:
          // for some reason calling blur() doesn't work here...lets just
          // focus the browser instead
          content.focus();
          return;
      }
    },

    MoveInList: function(dir) {
      var list = fbLib.GetFriendsListElement();
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
        fbLib.SelectItemInList(item, list);
      }
    },

    LikeIframeLoad: function()
    {
            fbLib.debug("in LikeIframeLoad");
            var x = document.getElementById("facebook-like-iframe");
            var y = x.contentDocument;
            y.body.setAttribute("style", "background-color: blue !important;");

            return true;
    },

    FacebookLogin: function() {
      if (fbSvc.loggedIn) {
        fbSvc.sessionEnd();
      }
      else {
        var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
        var accessToken = prefSvc.getCharPref('extensions.facebook.access_token');
        var permissionsLevel = prefSvc.getIntPref('extensions.facebook.permissions.level');
        /*if (accessToken && permissionsLevel > 0) {
          fbLib.openAndReuseOneTabPerURL("https://www.facebook.com/login.php");
          fbLib.setAttributeById('facebook-login-status', 'status', 'waiting');
          setTimeout(function() { fbLib.setAttributeById('facebook-login-status', 'status', ''); }, 60*1000);
        }
        else */{
          //prefSvc.setIntPref('extensions.facebook.permissions.level', 0);
          var askUrl = "https://www.facebook.com/dialog/oauth?client_id=" + fbSvc.wrappedJSObject._appId + "&redirect_uri=http://www.facebook.com/connect/login_success.html&scope=manage_notifications,user_photos,publish_stream,status_update,friends_status&response_type=token";
          gBrowser.selectedTab = gBrowser.addTab(askUrl);
        }
      }
    },

    RenderStatusMsg: function(msg) {
        msg = msg.replace(/\s*$/g, '');
        if (msg && '.?!\'"'.indexOf(msg[msg.length-1]) == -1) {
            msg = msg.concat('.');
        }
        return msg;
    },

    SetProfileTime: function(item, time){
      item.setAttribute('ptime',fbLib.getProfileTime(time));
    },

    SetStatus: function(item, status, time) {
        if (status) {
            var firstName = item.getAttribute('firstname');
            var msg = /*firstName + ' ' + */fbLib.RenderStatusMsg(status);
            if (item.firstChild) {
                item.firstChild.nodeValue = msg;
            } else {
                item.appendChild(document.createTextNode(msg));
            }
            item.setAttribute('stime', fbLib.getStatusTime(time));
        } else {
            if (item.firstChild) {
                item.removeChild(item.firstChild);
            }
            item.removeAttribute('stime');
        }
    },

    DatesInSeconds: function() {
      this.minute  = 60;
      this.two_mins= 120;
      this.hour    = 60*this.minute;
      this.hour_and_half = 90*this.minute;
      this.day     = 24*this.hour;
      this.week    = 7*this.day;
      this.month   = 30.5*this.day;
      this.year    = 365*this.day;
    },

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

    getRelTime: function(time, isProfile) {
      var sbundle = fbLib.GetFBStringBundle();
      var elapsed   = Math.floor(new Date().getTime()/1000) - time;
      if( elapsed < fbLib.dates_in_seconds.week )
        return fbLib.getRelTimeWithinWeek(time, false, isProfile);
      if (elapsed < fbLib.dates_in_seconds.week*1.5)
        return sbundle.getString('aboutaweekago');
      if (elapsed < fbLib.dates_in_seconds.week*3.5) {
        var weeksElapsed = Math.round(elapsed/fbLib.dates_in_seconds.week);
        if (weeksElapsed == 2)
          return sbundle.getString('abouttwoweeksago');
        else
          return sbundle.getFormattedString('aboutweeksago', [weeksElapsed]);
      }
      if (elapsed < fbLib.dates_in_seconds.month*1.5)
        return sbundle.getString('aboutamonthago');
      return ''; //XX Brian - Why are we returning here?

      if (elapsed < fbLib.dates_in_seconds.year) {
        var monthsElapsed = Math.round(elapsed/fbLib.dates_in_seconds.month);
        if (monthsElapsed == 2)
          return sbundle.getString('abouttwomonthsago');
        else
          return sbundle.getFormattedString('aboutmonthsago', [monthsElapsed]);
      }
      return sbundle.getString('overayear');
    },

    getProfileTime: function(profile_time) {
      var relative_time = fbLib.getRelTime(profile_time, true);
      var sbundle = fbLib.GetFBStringBundle();
      var updatedProfileTime = sbundle.getFormattedString('updatedProfileTime', [relative_time]);
      return relative_time ? updatedProfileTime : '';
    },

    getRelTimeWithinWeek: function(time, initialCap, isProfile) {
      var currentTime = new Date;

      var updateTime = new Date;
      updateTime.setTime(time*1000);

      var sbundle = fbLib.GetFBStringBundle();

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
    },

    getStatusTime: function(status_time) {
      return fbLib.getRelTimeWithinWeek(status_time, true, false);
    },

    /**
     * This is called on _every_ page loaded in Firefox
     * and tests whether it's a Facebook URL. So it better be as
     * efficient as possible
     */
    IsFacebookLocation: function(location) {
      if( location && location.schemeIs // use to detect nsIURI
        && ( location.schemeIs("http") || location.schemeIs("https") ) ) {
        var len = location.host.length;
        return (len>=12) && ("facebook.com" == location.host.substring(len-12));
      }
      return false;
    },

    // Toggles the toolbar
    facebook_toggleToolbar: function()
    { /* modelled on webdeveloper toolbar behavior */
        var toolbar = document.getElementById("facebook-toolbar");
        toolbar.collapsed = !toolbar.collapsed;
        document.persist("facebook-toolbar", "collapsed");
    },

    GetFBStringBundle: function() {
      var sb = document.getElementById('facebook-strings');
      if (!sb && SIDEBAR_AVAILABLE) {
        fbLib.debug( "getting bundle from sidebar..." );
        sb = document.getElementById('sidebar').contentDocument.getElementById('facebook-strings');
      }
      return sb;
    },

    launchLikeWindow: function() {
      var likewin = window.openDialog("chrome://facebook/content/like/like.xul",
                      "FacebookFirstrun",
                      "chrome,centerscreen,resizable=no,dialog=no");
      return likewin;
    },
    
    openAndReuseOneTabPerURL: function(url) {
      var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                         .getService(Components.interfaces.nsIWindowMediator);
      var browserEnumerator = wm.getEnumerator("navigator:browser");

      // Check each browser instance for our URL
      var found = false;
      while (!found && browserEnumerator.hasMoreElements()) {
        var browserWin = browserEnumerator.getNext();
        var tabbrowser = browserWin.gBrowser;

        // Check each tab of this browser instance
        var numTabs = tabbrowser.browsers.length;
        for (var index = 0; index < numTabs; index++) {
          var currentBrowser = tabbrowser.getBrowserAtIndex(index);
          if (url == currentBrowser.currentURI.spec) {

            // The URL is already opened. Select this tab.
            tabbrowser.selectedTab = tabbrowser.tabContainer.childNodes[index];

            // Focus *this* browser-window
            browserWin.focus();

            found = true;
            break;
          }
        }
      }

      // Our URL isn't open. Open it now.
      if (!found) {
        var recentWindow = wm.getMostRecentWindow("navigator:browser");
        if (recentWindow) {
          // Use an existing browser window
          recentWindow.delayedOpenTab(url, null, null, null, null);
        }
        else {
          // No browser windows are open, so open a new one.
          window.open(url);
        }
      }
    }
    
    // EOF

}

fbLib.dates_in_seconds = new fbLib.DatesInSeconds();

var toolbarSearchMethod = Cc['@mozilla.org/preferences-service;1'].
    getService(Ci.nsIPrefBranch).
    getCharPref('extensions.facebook.toolbar_search_method');


if (toolbarSearchMethod == "graphapi")
{
    fbLib.TypeaheadSearch = fbLib.TypeaheadSearchGraphAPI;
}
else if (toolbarSearchMethod == "extensionservice")
{
    fbLib.TypeaheadSearch = fbLib.TypeaheadSearchExtensionService;
}
else
{
    fbLib.TypeaheadSearch = fbLib.TypeaheadSearchFriendsOnly;
}


