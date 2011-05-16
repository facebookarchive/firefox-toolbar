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

fbLib.debug( "toolbar.js" );

var facebook = {

    loggedOutTimeout: 0,

    obsSvc: Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService),

    topicToXulId: { 'facebook-msgs-updated':      'facebook-notification-msgs'
                    , 'facebook-pokes-updated':     'facebook-notification-poke'
                    , 'facebook-reqs-updated':      'facebook-notification-reqs'
                    , 'facebook-event-invs-updated':'facebook-notification-event-invs'
                    , 'facebook-group-invs-updated':'facebook-notification-group-invs'
                    },

    checkSeparator: function(data) {
        var showSep = false;
        for each( var elt_id in facebook.topicToXulId ) {
            if( fbLib.getAttributeById( elt_id, 'label') != "0" ) {
                showSep = true;
                break;
            }
        }
        fbLib.debug( 'showSep', showSep );
        fbLib.setAttributeById( 'facebook-notification-separator', 'hidden'
                        , showSep ? 'false': 'true' );
    },

    fbToolbarObserver: {
        observe: function(subject, topic, data) {
            fbLib.debug('toolbar observing something: ', topic);
            var fStrings = fbLib.GetFBStringBundle();
            var eltId = facebook.topicToXulId[topic];
            if( eltId ) {
                fbLib.setAttributeById(eltId, 'label', data);
                facebook.checkSeparator(data);
            }
            else {
                var statusBox;
                switch (topic) {
                case 'facebook-session-start':
                    subject = subject.QueryInterface(Ci.fbIFacebookUser);
                    fbLib.setAttributeById('facebook-name-info', 'label', subject.name);
                    statusBox = document.getElementById('facebook-toolbar-status');
                    statusBox.style.display="block";
                    statusBox.value = subject.status;
                    facebook.onStatusBoxBlur(statusBox); // change color for emptyText
                    fbLib.setAttributeById('facebook-name-info', 'userid', subject.id);
                    fbLib.setAttributeById('facebook-menu-my-profile', 'userid', subject.id);
                    fbLib.setAttributeById('facebook-login-status', 'label', fStrings.getString('logout'));
                    fbLib.setAttributeById('facebook-login-status', 'status', '');
                    fbLib.setAttributeById('facebook-login-status', 'tooltiptext', fStrings.getString('logout'));
                    var sb = fbLib.GetFBSearchBox();
                    if (sb.value != fStrings.getString('searchplaceholder') && sb.value != '') {
                        sb.value = '';
                        facebook.searchBoxBlur(sb);
                    }
                    fbLib.SetHint(true, fStrings.getString('loadingfriends'), '');

                    //fbLib.debug("currentURI is '" + gBrowser.currentURI.spec  + "'");
                    facebook.updateLikeCount2(gBrowser.currentURI.spec, gBrowser.contentDocument);
                    break;
                case 'facebook-session-end':
                    fbLib.debug('ending session...');
                    fbLib.setAttributeById('facebook-login-status', 'label', fStrings.getString('login'));
                    fbLib.setAttributeById('facebook-login-status', 'tooltiptext', fStrings.getString('login'));
                    fbLib.setAttributeById('facebook-name-info', 'label', '');
                    statusBox = document.getElementById('facebook-toolbar-status');
                    statusBox.style.display="none";
                    for each( var top in facebook.topicToXulId )
                        fbLib.setAttributeById( top, 'label', '?');
                    facebook.clearFriends(true);
                    facebook.updateLikeCount2(null, gBrowser.contentDocument);
                    break;
                case 'facebook-friends-updated':
                    facebook.loadFriends();
                    break;
                case 'facebook-new-friend':
                case 'facebook-friend-updated':
                    fbLib.debug( 'friend update...' );
                    subject = subject.QueryInterface(Ci.fbIFacebookUser);
                    facebook.updateFriend(subject);
                    break;
                case 'facebook-status-updated':
                    statusBox = document.getElementById('facebook-toolbar-status');
                    statusBox.value = data;
                    facebook.onStatusBoxBlur(statusBox);
                    break;
                case 'facebook-new-day':
                    facebook.clearFriends(false);
                    facebook.loadFriends();
                    break;
                }
            }
        }
    },

    progListener: {
        onLocationChange: function(webProgress, request, location) {
            if (fbSvc.loggedIn) {
                fbSvc.hintPageLoad(fbLib.IsFacebookLocation(location));
            }
        },
        onProgressChange: function(webProgress, request, curSelfProg, maxSelfProg, curTotalProg, maxTotalProg) {  },
        onSecurityChange: function(webProgress, request, state) {  },
        onStateChange: function(webProgress, request, stateFlags, status) {  },
        onStatusChange: function(webProgress, request, status, message) {  }
    },

    /*
    likeProgListener: {

        onLocationChange: function(webProgress, request, location) {
        fbLib.debug("in likeProgListener");

            var x = document.getElementById("facebook-like-iframe");
            var y = x.contentDocument;
            y.body.setAttribute("style", "background-color: blue !important;");
        },
        onProgressChange: function(webProgress, request, curSelfProg, maxSelfProg, curTotalProg, maxTotalProg) {  },
        onSecurityChange: function(webProgress, request, state) {  },
        onStateChange: function(webProgress, request, stateFlags, status) {  },
        onStatusChange: function(webProgress, request, status, message) {  }
    },
    */

     topics_of_interest:    [ 'facebook-session-start'
                            , 'facebook-friends-updated'
                            , 'facebook-friend-updated'
                            , 'facebook-new-friend'
                            , 'facebook-session-end'
                            , 'facebook-msgs-updated'
                            , 'facebook-pokes-updated'
                            , 'facebook-event-invs-updated'
                            , 'facebook-group-invs-updated'
                            , 'facebook-reqs-updated'
                            , 'facebook-new-day'
//                            , 'facebook-status-set-result'
                            , 'facebook-status-updated'
                            ],

    onPageLoad: function(event)
    {
        try
        {
            if (event.originalTarget.location.hostname == "www.facebook.com")
            {
                fbLib.debug('have facebook page load with url: ' + event.originalTarget.location.href);

                if (event.originalTarget.location.href.indexOf("access_token") > 0)
                {
                    var bits = event.originalTarget.location.hash.substring(1).split('&');

                    for (var i=0; i<bits.length; i++)
                    {
                        var tup = bits[i].split('=');

                        if (tup[0] == "access_token")
                        {
                            /*
                            var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                                .getService(Components.interfaces.nsIWindowMediator);
                            var enumerator = wm.getEnumerator(null);
                            while(enumerator.hasMoreElements()) {
                                var win = enumerator.getNext();
                                win.clearTimeout(Application.storage.get("authWindowCloseTimeout", null));
                            }

                            event.originalTarget.defaultView.close();
                            */

                            fbLib.debug( "have access token : "  + tup[1]);
                            fbSvc.sessionStartOAuth(tup[1]);
                            fbLib.debug( "finished session start");
                        }
                    }
                }
                else if (!fbSvc.loggedIn)
                {
                    // check if user is logging in to facebook site
                    facebook.checkForFBLogin();
                }

                if (fbSvc.loggedIn)
                {
                    // set a timeout to check if user is logged out of facebook.com site
                    clearTimeout(facebook.loggedOutTimeout);
                    facebook.loggedOutTimeout = setTimeout(facebook.checkForFBLogin, 1000 * 60 * 1);
                }
            }

            // get # likes for this link

            if (fbSvc.loggedIn
                && event.originalTarget.defaultView.parent == event.originalTarget.defaultView
                && event.originalTarget instanceof HTMLDocument
                && event.originalTarget.location.toString().substring(0,4) == "http"
                ) {

                facebook.updateLikeCount2(event.originalTarget.location.toString(), event.originalTarget);
            }
        }
        catch (e) {  fbLib.debug("pageload error: " + e);}
    },

    onTabSelect: function(e) {
        //fbLib.debug("on tab select, like count =  " + gBrowser.contentDocument._fbLikeCount);

        if (gBrowser.contentDocument._fbLikeCount)
        {
            fbLib.setAttributeById('facebook-like', 'tooltiptext', facebook.fStringBundle.getFormattedString('likethis', [gBrowser.contentDocument._fbLikeCount]));
        }
        else
        {
            fbLib.setAttributeById('facebook-like', 'tooltiptext', '');
        }
    },

    onTabSelect2: function(e) {
        facebook.updateLikeCount2(gBrowser.currentURI.spec, null);
    },

    updateLikeCount2: function(url, doc) {

        //fbLib.debug("in updateLikeCount2 with url = '" + url + "'");

        fbLib.setAttributeById('facebook-like-iframe', 'collapsed', 'true');

        if (url != null && url.match(/^http/))
        {
            fbLib.setAttributeById('facebook-like-iframe', 'src',
                (url?'https://www.facebook.com/plugins/like.php?action=like&colorscheme=white&href='+url+'&layout=button_count&src=fftb':'about:blank'));
        }

        //document.getElementById('facebook-like-iframe').addProgressListener(facebook.likeProgListener);
        //document.getElementById('facebook-like-iframe').contentDocument.addProgressListener(facebook.likeProgListener);
    },

    updateLikeCount: function(url, doc) {
        fbLib.setAttributeById('facebook-like', 'tooltiptext', '');

        //fbLib.debug("GETTING LIKES FOR URL '" + url + "'");

        var query = "SELECT like_count, normalized_url FROM link_stat WHERE url = '" + url + "'";
        
        fbSvc.wrappedJSObject.callMethod('facebook.fql.query', ['query='+query], function(data) {
            for each(var row in data) {
                like_count = Number(row.like_count);
                //fbLib.debug("facebook's #likes for the url '" + row.normalized_url + "' is : " + like_count);

                fbLib.setAttributeById('facebook-like', 'tooltiptext', facebook.fStringBundle.getFormattedString('likethis', [like_count]));
                doc._fbLikeCount = like_count;

                query = "SELECT id FROM object_url WHERE url = '" + row.normalized_url + "'";

                fbSvc.wrappedJSObject.callMethod('facebook.fql.query', ['query='+query], function(data) {
                    for each(var row2 in data) {
                        link_id = Number(row2.id);
                        fbLib.debug("facebook's #likes for the url '" + row.normalized_url + "' is : " + like_count + " ; id is : " + link_id);

                        query = "SELECT user_id FROM like WHERE object_id = " + link_id;

                        fbSvc.wrappedJSObject.callMethod('facebook.fql.query', ['query='+query], function(data) {
                            for each(var row3 in data) {
                                fbLib.debug("user #" + row3.user_id + " likes this link");
                            }
                        });

                        break;
                    }
                });

                break;
            }
        });
    },

    onLikeIframeLoad: function(event) {

        if (!fbSvc.loggedIn)
        {
            x.setAttribute("collapsed", "true");
            return;
        }

        if (event.originalTarget.location.hostname == "www.facebook.com" &&
                event.originalTarget.location.href.indexOf("plugins/like.php") > 0)
        {
            var x = document.getElementById("facebook-like-iframe");
            var y = x.contentDocument;

            x.setAttribute("collapsed", "true");
            x.setAttribute("style", "width: 90px !important;");

            var table = y.getElementsByTagName("table")[0];

            if (!table)
                return;

            x.setAttribute("collapsed", "false");

            var th = x.contentWindow.getComputedStyle(table,null).getPropertyValue("height");
            //fbLib.debug("table height: " + th);

            var widen = function(by)
            {
                //fbLib.debug("widening iframe from '" + parseFloat(x.boxObject.width) + "' to '" + (parseFloat(x.boxObject.width) + by) + "'");
                x.setAttribute("style", "width: " + (parseFloat(x.boxObject.width) + by) + "px !important;");

                var th = x.contentWindow.getComputedStyle(table,null).getPropertyValue("height");
                //fbLib.debug("table height: " + th);

                if (parseFloat(th) > 25 && by < 500)
                    setTimeout(function() { widen(by*1.5); }, 100);
            }

            if (parseFloat(th) > 25)
                setTimeout(function() { widen(20); }, 100);

            /*
            x.setAttribute("style", "width: 500px !important;");

            var tw = x.contentWindow.getComputedStyle(y.getElementsByTagName("table")[0],null).getPropertyValue("width");
            fbLib.debug("table width: " + tw);
            //fbLib.debug("boxobject table width: " + y.getElementsByTagName("table")[0].boxObject.width);
            //fbLib.debug("new table width: " + (parseFloat(tw)+10));

            setTimeout(function() { 

                var tw = x.contentWindow.getComputedStyle(y.getElementsByTagName("table")[0],null).getPropertyValue("width");
                fbLib.debug("timeout table width: " + tw);
                x.setAttribute("style", "width: " + (parseFloat(tw)+10) + "px !important;");
               // fbLib.debug("timeout boxobject table width: " + y.getElementsByTagName("table")[0].boxObject.width);
               // fbLib.debug("timeout new table width: " + (parseFloat(tw)+10));

            x.setAttribute('collapsed', 'false');

            }, 1000);

            //x.setAttribute("width", (parseFloat(tw)+10) + "px");
            //x.setAttribute("style", "width: 300px !important;");
            y.body.setAttribute("style", "background-color: blue !important;");
            */

        }

    },

    load: function() {
        fbLib.debug( "loading toolbar..." );

        gBrowser.addEventListener("DOMContentLoaded", facebook.onPageLoad, true);
        gBrowser.tabContainer.addEventListener("TabSelect", facebook.onTabSelect2, false);
        gBrowser.tabContainer.addEventListener("TabOpen", facebook.onTabSelect2, false);
        gBrowser.tabContainer.addEventListener("TabClose", facebook.onTabSelect2, false);
        document.getElementById("facebook-like-iframe").addEventListener("DOMContentLoaded", facebook.onLikeIframeLoad, true);

        facebook.updateLikeCount2(null, null);

        facebook.fStringBundle = fbLib.GetFBStringBundle();
        fbLib.debug(facebook.fStringBundle.src);
        var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
        if (!prefSvc.prefHasUserValue('extensions.facebook.not_first_run')) {
          // unfortunately if we create any tabs here, session store overrides
          // them, so instead we'll create a tab in 250 ms, hopefully after
          // session store does its business.
          window.setTimeout("getBrowser().loadOneTab('chrome://facebook/content/welcome.html', null, null, null, false, false)", 250);
          prefSvc.setBoolPref('extensions.facebook.not_first_run', true);
          prefSvc.lockPref('extensions.facebook.not_first_run');
        }
        document.getElementById('facebook-search').addEventListener('keypress', fbLib.HandleKeyPress, true);
        for each ( var topic in facebook.topics_of_interest ) {
            fbLib.debug( "observer added", topic );
            facebook.obsSvc.addObserver(facebook.fbToolbarObserver, topic, false);
        }

        var loggedInUser = fbSvc.loggedInUser;
        if (loggedInUser) {
            loggedInUser = loggedInUser.QueryInterface(Ci.fbIFacebookUser);
            fbLib.setAttributeById('facebook-name-info', 'label', loggedInUser.name);
            fbLib.setAttributeById('facebook-name-info', 'userid', loggedInUser.id);
            fbLib.setAttributeById('facebook-toolbar-status', 'value', loggedInUser.status);
            fbLib.setAttributeById('facebook-login-status', 'label', facebook.fStringBundle.getString('logout'));
            fbLib.setAttributeById('facebook-login-status', 'tooltiptext', facebook.fStringBundle.getString('logout'));
            fbLib.setAttributeById('facebook-menu-my-profile', 'userid', loggedInUser.id);
            fbLib.setAttributeById('facebook-notification-msgs', 'label', fbSvc.numMsgs);
            fbLib.setAttributeById('facebook-notification-poke', 'label', fbSvc.numPokes);
            fbLib.setAttributeById('facebook-notification-reqs', 'label', fbSvc.numReqs);
            fbLib.setAttributeById('facebook-notification-group-invs', 'label', fbSvc.numGroupInvs);
            fbLib.setAttributeById('facebook-notification-event-invs', 'label', fbSvc.numEventInvs);

            var statusBox = document.getElementById('facebook-toolbar-status');
            statusBox.style.display="block";
            facebook.onStatusBoxBlur(statusBox); // change color for emptyText
        } else {
          var hasSavedSession = fbSvc.savedSessionStart();
          fbLib.setAttributeById('facebook-login-status', 'status', hasSavedSession?'waiting':'');

          if (!hasSavedSession)
          {
              // try to get an auth token for currently logged in user.
              facebook.checkForFBLogin();
          }
        }
        facebook.loadFriends();
        getBrowser().addProgressListener(facebook.progListener);
        fbLib.debug('facebook toolbar loaded.');
        },

    checkForFBLogin: function()
    {
          var requrl = "https://www.facebook.com/dialog/oauth?client_id=" + fbSvc.wrappedJSObject._appId + "&redirect_uri=http://www.facebook.com/&scope=user_photos,publish_stream,status_update,friends_status&response_type=token";

          //if (this._prefService.getCharPref('extensions.facebook.access_token'))
          //    return;

          fbLib.debug('no saved session, checking facebook.com for currently logged in user: ' + requrl);

          var req = new XMLHttpRequest();

          req.mozBackgroundRequest = true;

          req.onreadystatechange = function (event) {
                if (req.readyState == 4) {
                    var status;
                    try {
                        status = req.status;
                    } catch (e) {
                        status = 0;
                    }

                    if (status == 200) {

                      var matches = req.responseText.match(/access_token=(.*)&/)

                      if (!matches)
                      {
                          fbLib.debug('user is not logged into facebook');
                          //fbSvc.sessionEnd();
                      }
                      else
                      {
                          var myjson = '{"accessToken": "' + matches[1] + '"}';
                          fbLib.debug('going to parse myjson "' + myjson + '"');

                          try 
                          {
                              var obj = JSON.parse(myjson);

                              fbLib.debug('user is logged into facebook, access_token = ' + obj.accessToken);

                              fbSvc.sessionStartOAuth(obj.accessToken);
                          }
                          catch (e)
                          {
                              fbLib.debug('error parsing access token: ' + e);
                          }
                      }
                    }
                }
            };
     
          req.open('get', requrl);
          req.send();
    },

    unload: function() {
        gBrowser.removeEventListener("DOMContentLoaded", facebook.onPageLoad, true);
        gBrowser.tabContainer.removeEventListener("TabSelect", facebook.onTabSelect2, false);
        gBrowser.tabContainer.removeEventListener("TabOpen", facebook.onTabSelect2, false);
        gBrowser.tabContainer.removeEventListener("TabClose", facebook.onTabSelect2, false);
        document.getElementById("facebook-like-iframe").removeEventListener("DOMContentLoaded", facebook.onLikeIframeLoad, true);

        for each (var topic in facebook.topics_of_interest)
            facebook.obsSvc.removeObserver(facebook.fbToolbarObserver, topic);
        if( fbSvc.loggedInUser )

        fbLib.debug('facebook toolbar unloaded.');
    },
    sortFriends: function(f1, f2) {
        var n1 = f1.name.toLowerCase();
        var n2 = f2.name.toLowerCase();
        if (n1 < n2) return -1;
        else if (n1 > n2) return 1;
        else return 0;
    },
  loadFriends: function() {
    fbLib.debug('loadFriends()');
    var list = document.getElementById('PopupFacebookFriendsList');
    if (list.firstChild && list.firstChild.id != 'FacebookHint') {
      return;
    }
    list.selectedIndex = -1;
    var count = {};
    var friends = fbSvc.getFriends(count);
    fbLib.debug('got friends', count.value);
    if (!fbSvc.loggedIn) {
      var lfLoad = facebook.fStringBundle.getString('loadFriends');
      fbLib.SetHint(true, lfLoad, 'fbLib.FacebookLogin()');
    } else if (!count.value) {
      fbLib.SetHint(true, facebook.fStringBundle.getString('loadingfriends'), '');
    } else {
      friends.sort(this.sortFriends);
      for each (var friend in friends) {
        this.createFriendNode(list, friend, null);
      }
      if (!fbLib.IsSidebarOpen()) {
        fbLib.SearchFriends(fbLib.GetFBSearchBox().value);
      }
    }
  },
  updateFriend: function(friend) {
    fbLib.debug( 'updating friend...' );
    var elem = document.getElementById('popup-' + friend.id);
    var list = document.getElementById('PopupFacebookFriendsList');
    this.createFriendNode(list, friend, elem);
  },
  createFriendNode: function(list, friend, elem) { // creates nodes in the search popup only
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
    fbLib.SetStatus(item, friend.status, friend.stime);
    item.setAttribute('ptime', fbLib.getProfileTime(friend.ptime) );

    item.setAttribute('onmouseover', "fbLib.SelectItemInList(this, this.parentNode)");
    item.setAttribute('onmousedown', "this.doCommand();");
    item.setAttribute('oncommand', "fbLib.OpenFBUrl('profile.php', '" + friend.id + "', event)");
    item.setAttribute('onclick', "checkForMiddleClick(this, event)" );
    item.setAttribute('userid', friend.id);
    item.setAttribute('pic', friend.pic);
    if (!elem) {
      // Note that this will put new friends at the bottom instead of alphabetized, but I think that's ok.
      // It would get fixed in any new windows or when the browser restarts.
      list.insertBefore(item, document.getElementById('FacebookHint'));
    }
  },
  searchBoxFocus: function(searchBox) {
    if (searchBox.value == facebook.fStringBundle.getString('searchplaceholder')) {
      searchBox.value='';
      searchBox.style.color='#000000';
    }
    if (!this.ignoreBlur && !fbLib.IsSidebarOpen()) {
      var popupElt = document.getElementById('PopupFacebookFriends');
      if (popupElt.openPopup) {
        popupElt.openPopup(searchBox, 'after_start', 0, 0, false, true);
      } else {
        popupElt.showPopup(searchBox, -1, -1, 'popup', 'bottomleft', 'topleft');
      }
      // if the sidebar was just open then we would be out of sync, so let's just filter the list to be safe
      if (fbSvc.loggedIn) {
        fbLib.SearchFriends(searchBox.value);
      }
    }
  },
  searchBoxBlur: function(searchBox) {
    if (!this.ignoreBlur) {
      document.getElementById('PopupFacebookFriends').hidePopup();
    }
    if (searchBox.value=='') {
      searchBox.style.color='#808080';
      searchBox.value = facebook.fStringBundle.getString('searchplaceholder');
    }
  },
  isEmptyStatusText: function (text) {
    return '' == text.trim();
  },
  onStatusBoxFocus: function(statusBox) {
    if (this.isEmptyStatusText(statusBox.value)) {
      statusBox.value = '';
    }
    statusBox.style.color = '#000000';
    statusBox.select();
  },
  onStatusBoxBlur: function(statusBox) {
    if (this.isEmptyStatusText(statusBox.value)) {
      statusBox.value = ''; // rely on the emptyText attribute
      statusBox.style.color = '#808080';
    } else {
      statusBox.style.color = '#000000';
    }
  },
  like: function() {
      fbSvc.wrappedJSObject.postGraphObject(link_id + "/likes", function(data) {
          fbLib.debug("have liked this link, in callback: " + data);
      });
  },
  share: function() {
    // not only do we need to encodeURIComponent on the string, we also need to escape quotes since
    // we are putting this into a string to evaluate (as opposed to evaluating it directly)
    var enc = function(str) {
      return encodeURIComponent(str).replace("'", "\\'", 'g');
    };
    var p = '.php?src=tb&v=4&u=' + enc(content.document.location.href) + '&t=' + enc(document.title);
    var window_url = "http://www.facebook.com/sharer" + p;
    var window_options = "toolbar=no,status=yes,resizable=yes,width=626,height=436";

    var openCmd = "window.open('" + window_url + "', 'sharer','" + window_options + "');";
    try {
      // If we're not on a facebook page, just jump down to the catch block and open the popup...
      if (!fbLib.IsFacebookLocation(content.document.location))
        throw null;
      // We're on a facebook page, so let's try using share_internal_bookmarklet...

      // We can access the function easily through content's wrappedJSObject, but unfortunately if
      // we try calling it directly, then the relative URL's in XMLHttpRequests are interpretted
      // relative to our current chrome:// url and fail.  So instead we check for the function...
      if (!content.wrappedJSObject.share_internal_bookmarklet)
          throw null;
      // ...and if the function is there then we have to do this lame javascript: url hack to
      // execute it.
      content.document.location = 'javascript:try { share_internal_bookmarklet("' + p +
        '"); } catch (e) { setTimeout("' + openCmd + '", 0); } void(0);';
    } catch(e) {
      fbLib.debug('title is: ' + document.title, 'url: ' + content.document.location.href, openCmd);
      window.open(window_url, "sharer", window_options);
    }
  },
  photoupload: function() {
    if (!fbSvc.loggedIn) {
        fbLib.FacebookLogin();

        if (!fbSvc.loggedIn) {
            let stringBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService)
                .createBundle("chrome://facebook/locale/photoupload/photoupload.properties");

            alert(stringBundle.GetStringFromName("mustLoginDialog"));
            return;
        }
    }

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Components.interfaces.nsIWindowMediator);
    var win = wm.getMostRecentWindow("facebook:photoupload");
    if (win) {
        win.focus();
    }
    else
    {
        window.openDialog('chrome://facebook/content/photoupload/photoupload.xul',
               'facebook:photoupload',
               'chrome,dialog=no,all');
    }
  },
  clearFriends: function(sessionEnded) {
    var list = document.getElementById('PopupFacebookFriendsList');
    while (list.firstChild && list.firstChild.id != 'FacebookHint') {
      list.removeChild(list.firstChild);
    }
    document.getElementById('PopupMessager').style.display = 'none';
    document.getElementById('PopupPoker').style.display = 'none';
    document.getElementById('PopupPoster').style.display = 'none';
    if (sessionEnded) {
      fbLib.SetHint(true, facebook.fStringBundle.getString('loadFriends'), 'fbLib.FacebookLogin()');
    }
  }
};

window.addEventListener('load', facebook.load, false);
window.addEventListener('unload', facebook.unload, false);

fbLib.debug('loaded toolbar.js');
