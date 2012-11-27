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

fbLib.debug( "toolbar.js" );

var facebook = {

    obsSvc: Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService),

    topicToXulId: { 'facebook-msgs-updated':      'facebook-notification-msgs'
                    , 'facebook-pokes-updated':     'facebook-notification-poke'
                    , 'facebook-reqs-updated':      'facebook-notification-reqs'
                    , 'facebook-event-invs-updated':'facebook-notification-event-invs'
                    , 'facebook-group-invs-updated':'facebook-notification-group-invs'
                    },

    /* Items that need to be enabled/disabled based on logged in state or permissions state */
    toolbarItemsIds: [ "facebook-sidebar-toggle",
                       "facebook-search",
                       "facebook-home",
                       "facebook-share",
                       //"facebook-like",
                       "facebook-photoupload",
                       "facebook-notification-poke",
                       "facebook-notification-reqs",
                       "facebook-notification-group-invs",
                       "facebook-notification-event-invs",
                       "facebook-notification-msgs",
                       "facebook-link-menu"
    ],

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
                var statusBox, nameButton;
                switch (topic) {
                case 'facebook-session-start':
                    fbLib.debug('starting session...');
                    facebook.toggleToolbarState(false);
                    subject = subject.QueryInterface(Ci.fbIFacebookUser);
                    nameButton = document.getElementById('facebook-name-info');
                    nameButton.style.display="block";
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

                    if (facebook.filterURL(gBrowser.selectedBrowser.currentURI.spec))
                        facebook.toggleLikeWidget("2");
                    else
                        facebook.updateLikeCount();

                    break;
                case 'facebook-session-end':
                    fbLib.debug('ending session...');
                    facebook.forceUIOff(false);

                    // redirect all open facebook pages

                    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                        .getService(Components.interfaces.nsIWindowMediator);
                    var browserEnumerator = wm.getEnumerator("navigator:browser");

                    while (browserEnumerator.hasMoreElements())
                    {
                        try
                        {
                            var brow = browserEnumerator.getNext().gBrowser;
                            var host = brow.currentURI.host;
                            if (host == "www.facebook.com")
                                brow.loadURI("http://www.facebook.com/");
                        } catch (e) {}
                    }

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

    topics_of_interest:     [ 'facebook-session-start'
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
        //fbLib.debug("onPageLoad: event with url: " + event.originalTarget.location);

        // here we are notified about any page load events in the main browser
        try
        {
            var doc = event ? event.originalTarget : null;
            if (!doc || doc.defaultView.frameElement)
            {
                // frame in document, do not process
                fbLib.debug("Frame in page loading, not processing");
                return;
            }

            if (facebook.filterURL(event.originalTarget.location)) {
                facebook.toggleLikeWidget("2");
                return;
            }

            if (doc.location.hostname == "www.facebook.com")
            {
                if (!fbSvc.loggedIn)
                {
                    // if this is a facebook page and we're not logged into the toolbar, then check can we get an access token now.

                    setTimeout(function()
                        {
                            facebook.checkForFBLogin();
                        }, 1000);
                }
                else
                {
                    if (event.originalTarget.location.href.indexOf("ai.php") > 0)
                    {
                        // hack to observer history api type page changes on facebook 
                        // popstate event not working for me

                        //fbLib.debug("onPageLoad: have an 'ai.php' url, will get like count for new history item");

                        setTimeout(function()
                        {
                            facebook.updateLikeCount();
                        }, 1000);
                    }
                }
            }

            // get # likes for this link

            if (fbSvc.loggedIn
                && event.originalTarget.defaultView.parent == event.originalTarget.defaultView
                && event.originalTarget instanceof HTMLDocument
                && event.originalTarget.location.toString().substring(0,4) == "http"
                && event.originalTarget.location.toString() == gBrowser.currentURI.spec.toString()
                ) {

                facebook.updateLikeCount();
            }
        }
        catch (e) {  fbLib.debug("pageload error: " + e);}
    },

    forceUIOff: function(aAuthNeeded) {
        var loginButtonString = aAuthNeeded ?
                                facebook.fStringBundle.getString('approve') :
                                facebook.fStringBundle.getString('login');
        fbLib.setAttributeById('facebook-login-status', 'label', loginButtonString);
        fbLib.setAttributeById('facebook-login-status', 'status', '');
        fbLib.setAttributeById('facebook-login-status', 'tooltiptext', loginButtonString);
        var nameButton = document.getElementById('facebook-name-info');
        nameButton.style.display="none";
        fbLib.setAttributeById('facebook-name-info', 'label', '');
        var statusBox = document.getElementById('facebook-toolbar-status');
        statusBox.style.display="none";
        for each( var top in facebook.topicToXulId )
            fbLib.setAttributeById( top, 'label', '?');
        facebook.clearFriends(true);
        facebook.toggleLikeWidget("2");
        facebook.toggleToolbarState(true);
    },

    toggleToolbarState: function(aDisable) {
        // Watch out, disabled=false does not enable everything, e.g. search box
        // Best to remove the attribute
        for (var i = 0; i < facebook.toolbarItemsIds.length; i++) {
            if (aDisable)
                fbLib.setAttributeById(facebook.toolbarItemsIds[i], "disabled", aDisable);
            else
                fbLib.removeAttributeById(facebook.toolbarItemsIds[i], "disabled");
        }
    },

    /* XX USING LIKE API 
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
    */

    onTabSelect: function(event) {
        if (fbSvc.loggedIn)
        {
            var tabUrl = gBrowser.selectedBrowser.currentURI.spec;
            if (tabUrl != "about:blank" && facebook.filterURL(tabUrl))
                facebook.toggleLikeWidget("2");
            else if (tabUrl != "about:blank")
                facebook.updateLikeCount();
            else
                facebook.toggleLikeWidget("2");
        }
    },

    /**
     * Check a url for irregular types (about:, chrome:, resource:)
     * @parameter aUrl - the url to check
     * @return boolean true to filter out (not use the url), false to let it through
     */
    filterURL: function(aUrl) {
        //var url = aEvent.originalTarget.location;
        if (aUrl) {
            var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                            .getService(Components.interfaces.nsIIOService);
            var scheme = ioService.extractScheme(aUrl);
            // Weed out about and chrome urls
            fbLib.debug("Loading " + scheme + "url...");
            if (scheme == "about" || scheme == "chrome" || scheme == "resource")
                return true;
        }
        return false;
    },

    /**
     * The like bug can not in the toolbarpalette because it does not appear in the DOM because
     *   of a bug in Firefox 3.6 where the localstore cache overrides any new items. And Like
     *   is a new item introduced recently.
     * This function moves the Like item from being a clild of the toolbar to being a child of
     *   the palette where it then appers in the DOM and is visible in the toolbar
     */
    moveLike: function() {
        try {
            var fBar = document.getElementById("facebook-toolbar");
            var likeItem = document.getElementById("facebook-like");
            var fns = document.getElementById("facebook-notification-separator");
            var newLike = fBar.removeChild(likeItem);
            fBar.insertBefore(newLike, fns.nextSibling);
        }
        catch(e) {
            fbLib.debug("Error moving like : "+e);
        }
    },

    /**
     * Toggle the Like widget
     * @parameter aLayer - the layer of the deck to show
     *   0 = make the clickable Like 'button' visible
     *   1 = Set the Like widget to loading (a throbber)
     *   2 = Set the Like widget to not supported (a question mark icon)
     */
    toggleLikeWidget: function(aLayer) {
        try {
            fbLib.setAttributeById('facebook-like-deck', 'selectedIndex', aLayer);
        }
        catch(e) {}
    },

    /**
     * Refresh the Like page
     */
    updateLikeCount: function() {
        try {
            var url = gBrowser.currentURI.spec;

            if (gBrowser.currentURI.ref && gBrowser.currentURI.ref != "")
                url = url.substring(0, url.indexOf('#'));

            facebook.toggleLikeWidget("1");

            var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
            if (prefSvc.getBoolPref('extensions.facebook.like.enabled'))
            {
                if (url != null && url.match(/^http/))
                {
                    // Bypass the cache if the url is the same (e.g. reload) so Like is not stuck in load limbo
                    var lif = document.getElementById('facebook-like-iframe');
                    var curUrl = lif.contentWindow.location;
                    var loadFlags = (curUrl == url) ? Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE : Ci.nsIWebNavigation.LOAD_FLAGS_NONE;
                    lif.webNavigation.loadURI(
                        'https://www.facebook.com/plugins/like.php?action=like&colorscheme=light&href='+encodeURIComponent(url)+'&layout=button_count&src=fftb',
                        loadFlags,
                        null, null, null);
                }
            }
        }
        catch(e) {
            fbLib.debug( "updateLikeCount failure : " + e );
        }
        return;

        // XX Not working yet
        // We will check if we still have permissions
        var query = ' SELECT read_stream'
                  + ' FROM permissions WHERE uid = :user ';
        query = query.replace( /:user/g, this._uid );
        fbSvc.wrappedJSObject.callMethod('facebook.fql.query', ['query='+query], function(data) {
            fbLib.debug("Permissions check returning : "+data);
        });

        //document.getElementById('facebook-like-iframe').addProgressListener(facebook.likeProgListener);
        //document.getElementById('facebook-like-iframe').contentDocument.addProgressListener(facebook.likeProgListener);
    },

    /* XX USING LIKE API
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
    */

    onAuthIframeLoad: function(event)
    {
        fbLib.debug("onAuthIframeLoad: with url: " + event.originalTarget.location);

        if ((event.originalTarget.location.hostname != "www.facebook.com")
            || (event.originalTarget.defaultView.parent != event.originalTarget.defaultView)
            || (!event.originalTarget instanceof HTMLDocument)
            || (event.originalTarget.location.toString().substring(0,4) != "http"))
        {
            fbLib.debug("onAuthIframeLoad: doing nothing");
            return;
        }

        if (event.originalTarget.location.href.indexOf("access_token") > 0)
        {
            // if the auth frame loads to a facebook.com/#access_token=xx then we've authenticated successfully

            var bits = event.originalTarget.location.hash.substring(1).split('&');

            for (var i=0; i<bits.length; i++)
            {
                var tup = bits[i].split('=');

                if (tup[0] == "access_token")
                {
                    fbLib.debug( "onAuthIframeLoad: have access token : "  + tup[1]);
                    fbSvc.sessionStartOAuth(tup[1]);
                    fbLib.debug( "onAuthIframeLoad: finished session start. Redirecting to Facebook.");
                    content.document.location = "https://www.facebook.com";
                }
            }
        }
        else
        {
            // if the auth frame loads to something else, then 

            if (!fbSvc.wrappedJSObject.hasSiteCookie())
            {
                // if FF has no facebook cookie, then we're logged out, do nothing
                fbLib.debug( "onAuthIframeLoad: no login cookie; doing nothing");
            }
            else if (event.originalTarget.location.toString().indexOf("login.php") > 0)
            {
                fbLib.debug( "onAuthIframeLoad: redirect to login page; doing nothing");
            }
            else
            {
                var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
                fbLib.debug("Checking if we have asked for permissions before");
                if (prefSvc.getBoolPref('extensions.facebook.permissions.asked')) {
                    facebook.forceUIOff(true);
                    return;
                }

                // if FF has a facebook user cookie, then we're logged in, but the user needs to give us permissions - open an auth tab
                fbLib.debug( "onAuthIframeLoad: have uiserver.php dialog in auth iframe: opening auth tab");

                var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                    .getService(Components.interfaces.nsIWindowMediator);
                var browserEnumerator = wm.getEnumerator("navigator:browser");

                while (browserEnumerator.hasMoreElements())
                {
                    var brow = browserEnumerator.getNext().gBrowser;

                    var matches = brow.currentURI.spec.match(/(uiserver.php)/);

                    if (matches)
                    {
                        gBrowser.selectedTab = brow;
                        return;
                    }
                }

                gBrowser.selectedTab = gBrowser.addTab("https://www.facebook.com/dialog/oauth?client_id=" + fbSvc.wrappedJSObject._appId + "&redirect_uri=http://www.facebook.com/connect/login_success.html&scope=manage_notifications,user_photos,publish_stream,status_update,friends_status&response_type=token");

                facebook.forceUIOff(true);
                prefSvc.setBoolPref('extensions.facebook.permissions.asked', true);
            }
        }
    },

    onLikeIframeLoad: function(event)
    {
        if (!fbSvc.loggedIn)
        {
            facebook.toggleLikeWidget("2");
            return;
        }

        if (facebook.filterURL(event.originalTarget.location)) {
            facebook.toggleLikeWidget("2");
            return;
        }

        try
        {
            if (event.originalTarget.location.hostname == "www.facebook.com" &&
                    event.originalTarget.location.href.indexOf("plugins/like.php") > 0)
            {
            fbLib.debug("like iframe loaded with location = " + event.originalTarget.location.toString());
                var x = document.getElementById("facebook-like-iframe");
                var y = x.contentDocument;

                //var iframewidth = y.getElementsByClassName('connect_widget_interactive_area')[0].offsetWidth;
                var iframewidth = y.getElementsByTagName('table')[0].offsetWidth;

                if (iframewidth == 0)
                    return;

                x.setAttribute("style", "width: " + (iframewidth+1) + "px !important;");
                x.setAttribute("collapsed", "false");
                fbLib.setAttributeById('facebook-like-deck', 'selectedIndex', '0');
            }
        } catch (e) {
            fbLib.debug( "onLikeIframeLoad failure : " + e );
        }
    },

    load: function() {
        gBrowser.addEventListener("DOMContentLoaded", facebook.onPageLoad, true);
        gBrowser.tabContainer.addEventListener("TabSelect", facebook.onTabSelect, true);
        try {
            facebook.moveLike();
            document.getElementById("facebook-like-iframe").addEventListener("DOMContentLoaded", facebook.onLikeIframeLoad, true);
        }
        catch(e) {
            // We did not find the Like button ... lets not stop because of it
            fbLib.debug( "Like button not found. This feature will not be activated" );
        }
        document.getElementById("facebook-auth-iframe").addEventListener("DOMContentLoaded", facebook.onAuthIframeLoad, true);

        facebook.toggleLikeWidget("1");

        facebook.fStringBundle = fbLib.GetFBStringBundle();

        facebook.prefWatcher.startup();

        setTimeout(function() {
                    facebook.firstrun();}, 250
        );

        document.getElementById('facebook-search').addEventListener('keypress', fbLib.HandleKeyPress, true);
        for each ( var topic in facebook.topics_of_interest ) {
            fbLib.debug( "observer added", topic );
            facebook.obsSvc.addObserver(facebook.fbToolbarObserver, topic, false);
        }

        var loggedInUser = fbSvc.loggedInUser;
        if (loggedInUser) {
            loggedInUser = loggedInUser.QueryInterface(Ci.fbIFacebookUser);
            var nameButton = document.getElementById('facebook-name-info');
            nameButton.style.display="block";
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
          // Disable the toolbar until we figure out if we are logged in/authorized or not
          facebook.toggleToolbarState(true);

          var hasSavedSession = fbSvc.savedSessionStart();

          fbLib.setAttributeById('facebook-login-status', 'status', (fbSvc.wrappedJSObject.hasSiteCookie()||hasSavedSession?'waiting':''));
          setTimeout(function() { fbLib.setAttributeById('facebook-login-status', 'status', ''); }, 60*1000);

          if (!hasSavedSession)
          {
              // try to get an auth token for currently logged in user.
              facebook.checkForFBLogin();
          }
        }
        facebook.loadFriends();
        getBrowser().addProgressListener(facebook.progListener);
    
        document.getElementById("PopupFacebookFriendsList").addEventListener("select", fbLib.searchBoxSelect, true);

        fbLib.debug('facebook toolbar loaded.');
    },

    /* Preferences observer */
    prefWatcher: {
      prefs: null,
      startup: function() {
        this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
          .getService(Components.interfaces.nsIPrefService)
          .getBranch("extensions.facebook");
        this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
        this.prefs.addObserver("", this, false);
      },
      shutdown: function()
      {
        this.prefs.removeObserver("", this);
      },
      observe: function(subject, topic, data) {
        if (topic != "nsPref:changed")
          return;

        if (data.match(/like.enabled/))
        {
            facebook.toggleLike();
        }
      }
    },

    startupLike: function()
    {
        try {
            var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
            let showLike = (prefSvc.getBoolPref('extensions.facebook.like.enabled')) ? 'false' : 'true';
            fbLib.setAttributeById('facebook-like', 'hidden', showLike);
        }
        catch(e) {}
    },

    toggleLike: function()
    {
        try {
            var likeItem = document.getElementById("facebook-like");
            var isHidden = likeItem.getAttribute("hidden");
            fbLib.setAttributeById('facebook-like', 'hidden', (isHidden == 'true') ? 'false' : 'true');

            // Activiate like immediately on current page
            facebook.updateLikeCount(gBrowser.currentURI.spec);
        }
        catch(e) {
        }
    },

    firstrun: function()
    {
        var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);

        // Should we launch the first-run dialog
        if (!prefSvc.getBoolPref('extensions.facebook.first_run_dialog')) {
          var likewin = fbLib.launchLikeWindow();
          /* Not working ...
          likewin.onclose = function() {
            facebook.aboutpage();
          }
          */
          prefSvc.setBoolPref('extensions.facebook.first_run_dialog', true);
        }
        else {
            facebook.startupLike();
        }
        // First-run page
        if (!prefSvc.getBoolPref('extensions.facebook.firstrun')) {
          facebook.aboutpage();
          prefSvc.setBoolPref('extensions.facebook.firstrun', true);
        }
    },

    aboutpage: function()
    {
        var aPage = "about:facebooktoolbar";
        getBrowser().loadOneTab(aPage, null, null, null, false, false);
    },

    checkForFBLogin: function()
    {
        fbLib.debug("checkForFBLogin: will load auth dialog in iframe");
        // load the oauth dialog in the hidden auth iframe, the load listener there will grab the access token 

        fbLib.setAttributeById('facebook-auth-iframe', 'src', "about:blank");

        fbLib.setAttributeById('facebook-auth-iframe', 'src', "https://www.facebook.com/dialog/oauth?client_id=" + fbSvc.wrappedJSObject._appId + "&redirect_uri=http://www.facebook.com/connect/login_success.html&scope=manage_notifications,user_photos,publish_stream,status_update,friends_status&response_type=token");
    },

    unload: function() {
        gBrowser.removeEventListener("DOMContentLoaded", facebook.onPageLoad, true);
        gBrowser.tabContainer.removeEventListener("TabSelect", facebook.onTabSelect, true);
        try {
            document.getElementById("facebook-like-iframe").removeEventListener("DOMContentLoaded", facebook.onLikeIframeLoad, true);
        }
        catch(e) {}
        document.getElementById("facebook-auth-iframe").removeEventListener("DOMContentLoaded", facebook.onAuthIframeLoad, true);

        for each (var topic in facebook.topics_of_interest)
            facebook.obsSvc.removeObserver(facebook.fbToolbarObserver, topic);
        if( fbSvc.loggedInUser )

        document.getElementById("PopupFacebookFriendsList").removeEventListener("select", fbLib.searchBoxSelect, true);

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

    if (list._hasLoadedFriends)
        return;

    /*
    if (list.firstChild && list.firstChild.id != 'FacebookHint') {
      return;
    }
    */

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
      list._hasLoadedFriends = true;
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
      if (fbSvc.loggedIn) {
      var popupElt = document.getElementById('PopupFacebookFriends');
      if (popupElt.openPopup) {
        popupElt.popupBoxObject.setConsumeRollupEvent(2); /* don't consume the rollup event */
        popupElt.openPopup(searchBox, 'after_start', 0, 0, false, true);
      } else {
        popupElt.showPopup(searchBox, -1, -1, 'popup', 'bottomleft', 'topleft');
      }
      // if the sidebar was just open then we would be out of sync, so let's just filter the list to be safe
        fbLib.TypeaheadSearch(searchBox.value);
      }
    }
  },

  popupHidden: function(e) {
   content.focus();
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
  /* XXX api-based like, not used for now.
  like: function() {
      fbSvc.wrappedJSObject.postGraphObject(link_id + "/likes", function(data) {
          fbLib.debug("have liked this link, in callback: " + data);
      });
  },
  */
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
    try
    {
        var list = document.getElementById('PopupFacebookFriendsList');
        while (list.getElementsByAttribute("class", "friendBox"))
        {
            list.removeChild(list.getElementsByAttribute("class", "friendBox")[0]);
        }
    } catch (e) { /*fbLib.debug(e);*/ }
    document.getElementById('PopupMessager').style.display = 'none';
    document.getElementById('PopupPoster').style.display = 'none';
    if (sessionEnded) {
      fbLib.SetHint(true, facebook.fStringBundle.getString('loadFriends'), 'fbLib.FacebookLogin()');
    }
  }
};

window.addEventListener('load', facebook.load, false);
window.addEventListener('unload', facebook.unload, false);

fbLib.debug('loaded toolbar.js');


var awesomebarSearchMethod = Cc['@mozilla.org/preferences-service;1'].
    getService(Ci.nsIPrefBranch).
    getCharPref('extensions.facebook.awesomebar_search_method');

if (awesomebarSearchMethod == "extensionservice")
{
    (function() {
      var urlbar = document.getElementById('urlbar');
      if (!urlbar) {
          return;
      }
       
      // Add the fb autocomplete so we get to provid results
      var new_attr = urlbar.getAttribute('autocompletesearch') + ' facebook-toolbar-remote-autocomplete';
      urlbar.setAttribute('autocompletesearch', new_attr);
      
      // Listen for selections so we can set the referrer to the toolbar
      var observer = {
          observe: function(subject, topic, data) {
          if (topic != "http-on-modify-request") {
              return;
          }

          subject.QueryInterface(Components.interfaces.nsIHttpChannel);
          if (-1 == subject.URI.host.search(/\.facebook\.com$/)) {
              return;
          }
          
          subject.setRequestHeader('X_FB_EXT', '1', false);
          //Components.utils.reportError(subject.URI.host);
          }
      };

      Components.classes["@mozilla.org/observer-service;1"]
          .getService(Components.interfaces.nsIObserverService)
          .addObserver(observer, "http-on-modify-request", false);

    })();
}

