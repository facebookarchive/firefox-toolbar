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

const BASE_CHECK_INTERVAL = 5*60*1000; // 5 minutes
const DEBUG     = false;
const VERBOSITY = 0; // 0: no dumping, 1: normal dumping, 2: massive dumping

var debug = ( VERBOSITY < 1 )
  ? function() {}
  : function() {
  dump('FacebookService: ');
  if (debug.caller && debug.caller.name) {
    dump(debug.caller.name + ': ');
  }
  for( var i=0; i < arguments.length; i++ ) {
    if( i ) dump( ', ' );
    switch( typeof arguments[i] ) {
      case 'xml':
        dump( arguments[i].toXMLString() );
        break;
      case 'object':
        try { // won't work if object has methods :(
            var out = JSON.stringify(arguments[i]);
            dump(out);
        } catch (e) {
            dump( '[obj]\n' );
            for( prop in arguments[i] )
                dump( ' ' + prop + ': ' + arguments[i][prop] + '\n' );
            dump( '[/obj]\n' );
        }
        break;
      default:
        dump( arguments[i] );
    }
  }
  dump('\n');
};
var vdebug = ( VERBOSITY < 2 ) ? function() {} : debug;

const CONTRACT_ID  = '@facebook.com/facebook-service;1';
const CLASS_ID     = Components.ID('{e983db0e-05fc-46e7-9fba-a22041c894ac}');
const CLASS_DESCRIPTION   = 'Facebook API Connector';

const Cc = Components.classes;
const Ci = Components.interfaces;
const PASSWORD_URL = 'chrome://facebook/';

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

// Load MD5 code...
Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript('chrome://facebook/content/md5.js');

// Compatibility with Firefox 3.0 that doesn't have native JSON.
if (typeof(JSON) == "undefined") {
  Components.utils.import("resource://gre/modules/JSON.jsm");
  JSON.parse = JSON.fromString;
  JSON.stringify = JSON.toString;
}

/** class SetNotif:
 * Encapsulates notifs for a set of ids delivered as a JSON array.
 * Watcher for "size" property notifies the observer when the size value
 * changes.
 */
function SetNotif( idArr, topic, dispatcher, on_new_item ) {
    this.topic = topic;
    this.dispatcher  = dispatcher;
    this.on_new_item = on_new_item;
    this.watch( "size", function( prop, oldVal, newVal ) {
        if( oldVal != newVal )
            dispatcher.notify( null, topic, newVal );
        return newVal;
    });
    this.init( idArr );
}
SetNotif.prototype.__defineGetter__( "count", function() {
  debug( this.topic, "count accessed", this.size );
  return this.size;
});
SetNotif.prototype.update = function( idArr ) {
    debug( "SetNotif.update", this.topic, idArr );
    var itemSet = {};
    var diff  = [];
    this.size = idArr.length !== undefined ? idArr.length : 0;
    for( var i=0; i<this.size; i++ ){
        it = Number(idArr[i]);
        itemSet[it] = true;
        if( !this.items[it] )
            diff.push(it);
    }
    if( diff.length > 0 && null != this.on_new_item )
        this.on_new_item( this, diff );
    this.items = itemSet;
}
SetNotif.prototype.init = function( idArr ) {
    debug( "SetNotif.init", idArr );
    this.size   = idArr.length !== undefined ? idArr.length : 0;
    var itemSet = {};
    if( this.size > 0 )
        for each( var it in idArr )
            itemSet[it] = true;
    this.items = itemSet;
}

/* class CountedNotif:
 * Encapsulates notifs for which a JS object
 * containing an unread and most recent element is present.
 */
function CountedNotif( notif, topic, dispatcher, on_new_unread ) {
    this.topic = topic;
    this.on_new_unread = on_new_unread;
    this.dispatcher = dispatcher;
    this.time  = Number(notif.most_recent);
    this.count = Number(notif.unread);
}
CountedNotif.prototype.__defineSetter__( "count", function( count ) {
  debug( this.topic, 'setCount', count );
  this.dispatcher.notify(null, this.topic, count);
  this._count = count;
});
CountedNotif.prototype.__defineGetter__( "count", function() {
  debug( this.topic, "count accessed", this._count );
  return this._count;
});
CountedNotif.prototype.setTime = function( new_time ) {
    debug( this.topic, 'setTime', this.time, new_time );
    if( ('function' == typeof this.on_new_unread)
        && (new_time > this.time)
        && (this.count > 0) ) {
        this.on_new_unread( this.count );
    }
    if( new_time != this.time )
        this.time = new_time;
};
CountedNotif.prototype.update = function(notif) {
    this.count = Number(notif.unread);
    this.setTime( Number(notif.most_recent) );
};

var fbSvc; // so that all our callback functions objects can access "this"
function facebookService() {
    // wrappedJSObject for accessing properties directly from JavaScript.
    // Used insetad of .idl when it would make it difficult or very verbose.
    this.wrappedJSObject = this;

    debug('constructor');

    this._apiKey = '8d7be0a45c164647647602a27106cc65';
    this._secret = 'c9646e8dccec4c2726c65f6f5eeca86a';

    this.stringBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                              .getService(Components.interfaces.nsIStringBundleService)
                              .createBundle("chrome://facebook/locale/facebook.properties");

    this.initValues();

    fbSvc = this;
    if( !DEBUG )
      this._checker = {
        notify: function(timer) {
          var now = Date.now();
          // only do a check if either:
          //   1. we loaded an fb page in the last minute
          if ((fbSvc._lastFBLoad > fbSvc._lastChecked)
          //   2. or we haven't checked in the last 5 minutes and any page has loaded
              || ( fbSvc._lastPageLoad > fbSvc._lastChecked
                  && now > fbSvc._lastChecked + BASE_CHECK_INTERVAL)
          //   3. or we haven't checked in the last 10 minutes and no page has loaded
              || ( now > fbSvc._lastChecked + BASE_CHECK_INTERVAL*2))
          {
            var now = Date.now();
            var interval = now - fbSvc._lastChecked;
            fbSvc._lastChecked = now;
            debug('_checker.notify: checking', now, fbSvc._lastFBLoad, fbSvc._lastPageLoad, fbSvc._lastChecked);
            // note: suppress notifications if we haven't successfully checked for the last 30 minutes
            fbSvc.checkUsers(now > (fbSvc._lastCheckedFriends + BASE_CHECK_INTERVAL * 6));
            fbSvc.checkNotifications(false, interval);
            fbSvc.checkAlbums(interval);
            fbSvc.checkCanSetStatus();
          } else {
            debug('_checker.notify: skipping', now, fbSvc._lastFBLoad, fbSvc._lastPageLoad, fbSvc._lastChecked);
          }
        }
      };
    else
      this._checker = {
        notify: function(timer) {
          var now = Date.now();
          var interval = now - fbSvc._lastChecked;
          fbSvc._lastChecked = now;
          debug('_checker.notify: checking', now, fbSvc._lastFBLoad, fbSvc._lastPageLoad, fbSvc._lastChecked);
          // note: suppress notifications if we haven't successfully checked for the last 30 minutes
          fbSvc.checkUsers(now > fbSvc._lastCheckedFriends + BASE_CHECK_INTERVAL * 6);
          fbSvc.checkNotifications(false, interval);
          fbSvc.checkAlbums(interval);
          fbSvc.checkCanSetStatus();
        }
      };
    this._initialize = {
        notify: function(timer) {
            debug('_initialize.notify');
            fbSvc._lastChecked = Date.now();
            fbSvc.checkUsers(true);
            fbSvc.checkNotifications(true);
            fbSvc.checkAlbums(0);
            fbSvc.checkCanSetStatus();
            fbSvc._dailyNotifier.set(timer);
        }
    };
    this._dailyNotifier = {
        // this is our really lame way of making sure that the status update
        // times properly get updated each day (so that "today" becomes
        // "yesterday", etc.).
        set: function(timer) {
            // note that we could use a repeating timer instead of always
            // firing one shot timers, but this is slightly less code since we
            // have to do it this way the first time around anyway, and since
            // this only gets run once a day it seems harmless
            var now = new Date();
            var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 1);
            timer.initWithCallback(this, midnight-now, Ci.nsITimer.TYPE_ONE_SHOT);
        },
        notify: function(timer) {
            debug('_dailyNotifier.notify');
            fbSvc.notify(null, 'facebook-new-day', null);
            this.set(timer);
        }
    };
    this._numAlertsObj = { value: 0 };

    this._winService      = Cc["@mozilla.org/appshell/window-mediator;1"]
        .getService(Ci.nsIWindowMediator);
    this._observerService = Cc["@mozilla.org/observer-service;1"]
        .getService(Ci.nsIObserverService);
    this._prefService     = Cc['@mozilla.org/preferences-service;1']
        .getService(Ci.nsIPrefBranch2);
    try {
      this._alertService = Cc["@mozilla.org/alerts-service;1"]
        .getService(Ci.nsIAlertsService);
    } catch(e) {
      this._alertService = null;
    }

    this._ff3Login = false;
    if ("@mozilla.org/passwordmanager;1" in Cc) {
      // Password Manager exists so this is not Firefox 3 (could be Firefox 2, Netscape, SeaMonkey, etc).
      this._pwdService      = Cc['@mozilla.org/passwordmanager;1'].getService(Ci.nsIPasswordManager);
      this._pwdServiceInt   = Cc['@mozilla.org/passwordmanager;1'].getService(Ci.nsIPasswordManagerInternal);
    } else if ("@mozilla.org/login-manager;1" in Cc) {
      // Login Manager exists so this is Firefox 3
      this._ff3Login = true;
      this._loginManager = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
    }

    this._observerService.addObserver(this, "final-ui-startup", false);
}

function AlertObserver() { }
AlertObserver.prototype = { // see https://developer.mozilla.org/en/nsIAlertsService
    // Components.interfaces.nsIObserver
    observe: function(subject, topic, data) {
        vdebug("alert observed:", subject, "topic: " + topic, "data: " + data);
        if (topic == 'alertclickcallback') {
            debug('opening alert url', data);
            var win = fbSvc._winService.getMostRecentWindow( "navigator:browser" );
            var browser = win ? win.getBrowser() : null;
            if( browser
                && 2 != fbSvc._prefService.getIntPref('browser.link.open_newwindow') )
                // 1 => current Firefox window;
                // 2 => new window;
                // 3 => a new tab in the current window;
                { // open in a focused tab
                    var tab = browser.addTab( data );
                    browser.selectedTab = tab;
                    win.content.focus();
                }
            else {
                win = Cc["@mozilla.org/appshell/appShellService;1"]
                    .getService(Ci.nsIAppShellService).hiddenDOMWindow;
                win.open( data );
            }
        }
    },

    // Components.interfaces.nsISupports
    QueryInterface : function(iid) {
        if ( iid.equals(Components.interfaces.nsIObserver)
             || iid.equals(Components.interfaces.nsISupportsWeakReference)
             || iid.equals(Components.interfaces.nsISupports)
             )
            return this;
        throw Components.results.NS_NOINTERFACE;
    }
};

facebookService.prototype = {
    classID: CLASS_ID,
    classDescription: CLASS_DESCRIPTION,
    contractID: CONTRACT_ID,

    QueryInterface: XPCOMUtils.generateQI([
        Ci.fbIFacebookService,
        Ci.nsIObserver,
        Ci.nsISupports,
        Ci.nsISupportsWeakReference,
        Ci.nsIWeakReference
        ]),

    // nsISupports implementation
    /*
    QueryInterface: function (iid) {
        if (iid.equals(Ci.fbIFacebookService) ||
            iid.equals(Ci.nsIObserver) ||
            iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsISupportsWeakReference) ||
            iid.equals(Ci.nsIWeakReference)
            ) {
            return this;
        }
        throw Components.results.NS_ERROR_NO_INTERFACE;
    },
    */

    // nsIWeakReference
    QueryReferent: function(iid) {
        return this.QueryInterface(iid);
    },

    // nsISupportsWeakReference
    GetWeakReference: function() {
        return this;
    },

    // nsIObserver
    observe: function(subject, topic, data) {
        if (topic != "final-ui-startup")
            return;
        this.migrate();
    },

    // ----------- Migration code -----------------//

    // Make the photo uploader button visible if the toolbar was customized.
    migrate_0to1: function() {
        const PHOTOUPLOAD_BUTTON_ID = "facebook-photoupload";
        var currentSet = this._rdf.GetResource("currentset");

        // get an nsIRDFResource for the facebook-toolbar item
        var fbBar = this._rdf.GetResource("chrome://browser/content/browser.xul#facebook-toolbar");
        var target = this._getPersist(fbBar, currentSet);

        if (!target || target.indexOf(PHOTOUPLOAD_BUTTON_ID) != -1)
            return;

        if (target.indexOf("facebook-share,") != -1) {
            // Try to add it on the right of the share icon.
            target = target.replace("facebook-share,", "facebook-share," + PHOTOUPLOAD_BUTTON_ID + ",");
        } else if (target.indexOf(",spring,facebook-login-info") != -1) {
            // Otherwise, try to add it on the left of the login info button.
            target = target.replace(",spring,facebook-login-info",
                                    "," + PHOTOUPLOAD_BUTTON_ID + ",spring,facebook-login-info");
        } else {
            // At last resort, put it in the end.
            target += "," + PHOTOUPLOAD_BUTTON_ID;
        }
        this._setPersist(fbBar, currentSet, target);

        // force the RDF to be saved
        if (this._dirty)
            this._dataSource.QueryInterface(Ci.nsIRDFRemoteDataSource).Flush();
    },

    migrate: function() {
        const MIGRATION_PREF = "extensions.facebook.migration.version";
        const LAST_MIGRATION_VERSION = 1;

        var prefBranch = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
        var migration = 0;
        try {
            migration = prefBranch.getIntPref(MIGRATION_PREF);
        } catch(ex) { }

        if (migration == LAST_MIGRATION_VERSION)
            return;

        // grab the localstore.rdf and make changes needed for new UI
        this._rdf = Cc["@mozilla.org/rdf/rdf-service;1"].getService(Ci.nsIRDFService);
        this._dataSource = this._rdf.GetDataSource("rdf:local-store");
        this._dirty = false;

        // Version 0 is for version less or equal to 1.3 (the migration.version
        // pref didn't exist yet).

        // Version 1 is for version 1.4.
        // This version adds the the photo uploader button which needs to be
        // added if the toolbar was customized otherwise it will be hidden.

        if (migration == 0) {
            this.migrate_0to1();
        }

        // update the migration version
        prefBranch.setIntPref(MIGRATION_PREF, LAST_MIGRATION_VERSION);
        // free up the RDF service
        this._rdf = null;
        this._dataSource = null;
    },

    _getPersist: function (aSource, aProperty) {
        var target = this._dataSource.GetTarget(aSource, aProperty, true);
        if (target instanceof Ci.nsIRDFLiteral)
            return target.Value;
        return null;
    },

    _setPersist: function (aSource, aProperty, aTarget) {
        this._dirty = true;
        try {
            var oldTarget = this._dataSource.GetTarget(aSource, aProperty, true);
            if (oldTarget) {
                if (aTarget)
                    this._dataSource.Change(aSource, aProperty, oldTarget, this._rdf.GetLiteral(aTarget));
                else
                    this._dataSource.Unassert(aSource, aProperty, oldTarget);
            }
            else {
                this._dataSource.Assert(aSource, aProperty, this._rdf.GetLiteral(aTarget), true);
            }
        }
        catch(ex) {}
    },

    // ----------- Start Notifications -----------------//
    get numMsgs()       { return this._messages.count; },
    get numPokes()      { return this._pokes.count; },
    get numReqs()       { return this._reqs.count; },
    get numEventInvs()  { return this._eventInvs.count; },
    get numGroupInvs()  { return this._groupInvs.count; },
    // ----------- End Notifications -----------------//

    get apiKey() {
        return this._apiKey;
    },
    get secret() {
        return this._secret;
    },
    get loggedIn() {
        return this._loggedIn;
    },
    get loggedInUser() {
        return this._loggedInUser;
    },
    get canSetStatus() {
        debug("Can Set Status", this._canSetStatus);
        return Boolean(this._canSetStatus);
    },
    savedSessionStart: function() {
        var uid = this._prefService.getCharPref('extensions.facebook.uid');
        if (!uid) {return;}
        debug( 'SAVED SESSION', uid );

        if (this._ff3Login) {
          var hostname = PASSWORD_URL;
          var formSubmitURL = PASSWORD_URL;
          var session_secret = null,
              session_key = null;

          // Find users for the given parameters
          var logins = this._loginManager.findLogins({}, hostname, formSubmitURL, null);

          // Find user from returned array of nsILoginInfo objects
          for (var i = 0; i < logins.length; i++) {
              session_key    = logins[i].username;
              session_secret = logins[i].password;
              break;
          }
          this.sessionStart(session_key, session_secret, uid, true);
        } else {
          var session_secret = { value: "" },
              session_key    = { value: "" },
              throwaway      = { value: "" };

          this._pwdServiceInt.findPasswordEntry( PASSWORD_URL, null /* username */, null /* password */,
              throwaway /* hostURIFound */, session_key /* usernameFound */, session_secret /*pwdFound*/ );
          this.sessionStart( session_key.value, session_secret.value, uid, true );
        }
    },
    sessionStart: function(sessionKey, sessionSecret, uid, saved) {
        debug( 'sessionStart', sessionKey, sessionSecret, uid );
        if (!sessionKey || !sessionSecret || !uid) {
          debug('sessionStart called with invalid values, aborting');
          if (saved) {this.sessionEnd();}
          return;
        }
        this._sessionKey    = sessionKey;
        this._sessionSecret = sessionSecret;
        this._loggedIn      = true;
        this._uid           = uid;

        if( !saved ) {
          // persist API sessions across the Firefox shutdown
          // by saving them in the password store
          this.savePref( 'extensions.facebook.uid', this._uid );
          if (this._ff3Login) {
            var hostname = PASSWORD_URL;
            var formSubmitURL = PASSWORD_URL;

            // Clear out saved information for this extension
            var logins = this._loginManager.findLogins({}, hostname, formSubmitURL, null);
            for (var i = 0; i < logins.length; i++) {
              this._loginManager.removeLogin(logins[i]);
            }

            var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",
                                                         Components.interfaces.nsILoginInfo,
                                                         "init");
            var extLoginInfo = new nsLoginInfo(hostname, formSubmitURL, null,
                                               this._sessionKey, this._sessionSecret,
                                               '' /*usernameField*/, '' /*passwordField*/);
            this._loginManager.addLogin(extLoginInfo);
          } else {
            this._pwdServiceInt.addUserFull(PASSWORD_URL, this._sessionKey, this._sessionSecret,
                                           'key', 'secret'); // last two values don't matter
          }
        }

        this._timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this._timer.initWithCallback(this._checker, BASE_CHECK_INTERVAL/5, Ci.nsITimer.TYPE_REPEATING_SLACK);

        // fire off another thread to get things started
        this._oneShotTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this._oneShotTimer.initWithCallback(this._initialize, 1, Ci.nsITimer.TYPE_ONE_SHOT);

        this.checkCanSetStatus();
    },
    savePref: function( pref_name, pref_val ) {
        this._prefService.unlockPref( pref_name );
        this._prefService.setCharPref( pref_name, pref_val );
        this._prefService.lockPref( pref_name );
    },
    sessionEnd: function() {
        debug('sessionEnd');
        // remove session info from prefs because of explicit logout
        // or because they didn't work
        this.savePref( 'extensions.facebook.uid', '' );
        if (this._ff3Login) { // Clear out saved information for this extension
          var hostname = PASSWORD_URL;
          var formSubmitURL = PASSWORD_URL;

          var logins = this._loginManager.findLogins({}, hostname, formSubmitURL, null);
          for (var i = 0; i < logins.length; i++) {
            this._loginManager.removeLogin(logins[i]);
          }
        } else if (this._sessionKey && this._sessionSecret) {
          debug('Removing sessionKey from passwords', this._sessionKey);
          this._pwdService.removeUser(PASSWORD_URL, this._sessionKey);
        }

        this.initValues();
        if (this._timer) {
          this._timer.cancel();
          this._oneShotTimer.cancel();
        }
        this.notify(null, 'facebook-session-end', null);
    },
    hintPageLoad: function(fbPage) {
        if (fbPage)
            this._lastFBLoad = Date.now();
        else
            this._lastPageLoad = Date.now();
    },
    initValues: function() {
        this._sessionKey    = null;
        this._sessionSecret = null;
        this._uid           = null;
        this._loggedIn      = false;
        this._canSetStatus  = null;
        this._loggedInUser  = null;

        this._messages      = null; // CountedNotif
        this._pokes         = null; // CountedNotif
        this._groupInvs     = null; // SetNotif
        this._eventInvs     = null; // SetNotif
        this._reqs          = null; // SetNotif

        this._friendDict   = {};
        this._albumDict    = {};

        this._pendingRequest = false;
        this._pendingRequests = [];
        this._lastCallId     = 0;
        this._lastChecked    = 0;
        this._lastFBLoad     = 0;
        this._lastPageLoad   = 0;
        this._lastCheckedFriends = 0;
    },
    setStatus: function(status) {
        if (status == "is " || status == "set your status...") {
            status = "";
        }

        if (status == this._loggedInUser.status) {
            return;
        }

        if (this.canSetStatus) {
            var is_clear = status=="";
            var params   = is_clear ? ['clear=1'] : ['status='+status, 'status_includes_verb=1'];
            fbSvc.callMethod('facebook.users.setStatus', params, function(data) {
                var result; var msg;
                debug('users.setStatus:', params, data);
                if (data) {
                    msg = is_clear ? 'Your status was cleared successfully.'
                     : 'Your status was set successfully.';
                    result = is_clear ? 'clear' : 'set';
                } else {
                    result = 'fail';
                    msg = 'Your status could not be set.';
                }
                fbSvc.notify(null, 'facebook-status-set-result', result);
                fbSvc._showPopup('you.status', fbSvc._loggedInUser.pic_sq, msg,
                   'http://www.facebook.com/profile.php?id=' + fbSvc._uid + '&src=fftb#status');
            });
        } else {
            debug("Facebook Toolbar doesn't have status_update perm?");
            fbSvc.notify(null, 'facebook-status-set-result', 'perm' );
        }
    },
    checkCanSetStatus: function() {
      if (null != this._canSetStatus) {return;}

      this.callMethod('facebook.users.hasAppPermission', ['ext_perm=status_update'], function(data){
          vdebug('data:', data);

          fbSvc._canSetStatus = ('1' == data.toString());
          debug('Can Set Status?', fbSvc._canSetStatus);
      });
    },
    clearCanSetStatus: function() {
        this._canSetStatus = null;
    },

    // onInit : bool : true if this is an initial load of notifications, false otherwise
    // interval: int : for non-initial loads of notifications, the window in which to
    // grab facebook notifications
    checkNotifications: function(onInit, window) {
        this.callMethod('facebook.notifications.get', [], function(data) {
            vdebug('notification data:', data);
            if (onInit){
                fbSvc._messages = new CountedNotif( data.messages,'facebook-msgs-updated', fbSvc
                    , function( msgCount ) {
                        vdebug( "msgCount", msgCount );
                        var text = 'You have ' + ( msgCount==1 ? 'a new message' : 'new messages.' );
                        fbSvc.showPopup('you.msg', 'chrome://facebook/content/mail_request.gif',
                                         text, 'http://www.facebook.com/inbox/');
                    } );
                fbSvc._pokes = new CountedNotif( data.pokes, 'facebook-pokes-updated', fbSvc
                    , function( pokeCount ) {
                        vdebug( "pokeCount", pokeCount );
                        if( pokeCount > 0 ) {
                          var text = 'You have been ';
                          if( 1 == pokeCount )
                            text += 'poked.';
                          else if( 4 >= pokeCount )
                            text += 'poked ' + pokeCount + ' times.';
                          else
                            text += 'poked many times.';

                          fbSvc.showPopup('you.poke', 'chrome://facebook/content/poke.gif',
                                          text, 'http://www.facebook.com/home.php');
                        }
                    } );
                fbSvc._groupInvs = new SetNotif(data.group_invites, 'facebook-group-invs-updated', fbSvc, null );
                fbSvc._eventInvs = new SetNotif(data.event_invites, 'facebook-event-invs-updated', fbSvc, null );
                fbSvc._reqs = new SetNotif(data.friend_requests, 'facebook-reqs-updated', fbSvc
                    , function( self, delta ) {
                        fbSvc.getUsersInfo(delta, function(users) {
                            debug( "Got friend reqs", users.length );
                            for each (var user in users) {
                                self.items[user.id] = user;
                                fbSvc.notify(user, 'facebook-new-req', user.id);
                                fbSvc.showPopup('you.req', user.pic_sq, user.name + ' wants to be your friend',
                                               'http://www.facebook.com/reqs.php');
                            }
                        });
                    });
            } else {
                fbSvc._messages.update( data.messages );
                fbSvc._pokes.update( data.pokes );
                fbSvc._groupInvs.update( data.group_invites );
                fbSvc._eventInvs.update( data.event_invites );
                fbSvc._reqs.update( data.friend_requests );
            }
        });

        if (this._prefService.getBoolPref('extensions.facebook.notifications.toggle')
            && this._prefService.getBoolPref('extensions.facebook.notifications.you.site')) {

          var notif_query = " SELECT title_text, body_text, href, app_id FROM notification "
            + " WHERE recipient_id = :user AND is_hidden=0 AND is_unread=1";
          if (!onInit) {
            notif_query += " AND updated_time > (now() - :window)";
            notif_query = notif_query
              .replace( /:user/g, this._uid )
              .replace( /:window/g, Math.ceil(window/1000) + 30 );
          } else {
            notif_query = notif_query.replace( /:user/g, this._uid );
          }

          var app_query = " SELECT app_id, icon_url FROM application"
           + " WHERE app_id IN (SELECT app_id FROM #notif_query)";

          var queries = {
            notif_query: notif_query,
            app_query: app_query
          };
          var queries_str = JSON.stringify(queries);

          this.callMethod('facebook.fql.multiquery', ['queries='+queries_str], function(data) {
                            var application_icons = {};
                            var app_result, notif_result;
                            for each (var query_result in data) {
                              if ('notif_query' == query_result.name) {
                                notif_result = query_result.fql_result_set;
                              }
                              if ('app_query' == query_result.name) {
                                app_result = query_result.fql_result_set;
                              }
                            }

                            for each (var app_info in app_result) {
                              application_icons[app_info.app_id] = app_info.icon_url;
                            }

                            for each (var notification in notif_result) {
                              var notification_contents = notification.title_text;
                              if (notification.body_text) {
                                notification_contents += "\n\n"
                                  + '"' + notification.body_text + '"';
                              }
                              var app_icon = application_icons[notification.app_id]
                                || 'chrome://facebook/content/wall_post.gif';
                              fbSvc.showPopup('you.site', app_icon,
                                              notification_contents,
                                              notification.href);
                            }

                          });
        }
    },
    parseUsers: function(user_data) {
        users = {};
        for each (var user in user_data) {
            vdebug("user: " + user.uid, user);

            // note: for name and status, need to utf8 decode them using
            // the decodeURIComponent(escape(s)) trick - thanks
            // http://ecmanaut.blogspot.com/2006/07/encoding-decoding-utf8-in-javascript.html
            var name   = user.name, // decodeURIComponent(escape(user.name)),
            id     = String(user.uid),
            status = user.status ? user.status.message // decodeURIComponent(escape(user.status.message))
                                 : null,
            stime  = user.status && user.status.time ? user.status.time : 0,
            ptime  = Number(user.profile_update_time),
            notes  = Number(user.notes_count),
            wall   = Number(user.wall_count),
            pic    = user.pic_small  ? String(decodeURI(user.pic_small)) : null,
            pic_sq = user.pic_square ? String(decodeURI(user.pic_square)) : null
            ;
            if (!pic) {
                pic = pic_sq = 'chrome://facebook/content/t_default.jpg';
            }
            debug ("User status = "+status);
            users[id] = new facebookUser(id, name, pic, pic_sq, status, stime, ptime, notes, wall);
        }
        return users;
    },
    checkAlbums: function(window) {
      if( 0 == window ) { // initialization
        debug("Initial album check...");
        var query = " SELECT aid, owner, modified, size FROM album "
          + " WHERE owner IN (SELECT uid2 FROM friend WHERE uid1 = :user) and size > 0;";
        query = query.replace( /:user/g, this._uid );
        this.callMethod('facebook.fql.query', ['query='+query], function(data) {
          for each( var album in data ) {
            var aid      = Number(album.aid),
                size     = Number(album.size),
                modified = Number(album.modified),
                owner    = Number(album.owner);
            fbSvc._albumDict[ aid ] = { 'modified': modified,
                                        'size': size,
                                        'owner': owner };
          }
        });
      }
      // don't check for album changes if not going to show notifications
      else if( this._prefService.getBoolPref('extensions.facebook.notifications.toggle') &&
               this._prefService.getBoolPref('extensions.facebook.notifications.friend.album') ) {
        debug("Album check...", window);
        var query = " SELECT aid, owner, name, modified, size, link FROM album "
          + " WHERE owner IN (SELECT uid2 FROM friend WHERE uid1 = :user )"
         + " AND modified > (now() - :window) AND size > 0;";
        query = query.replace( /:user/g, this._uid )
                     .replace( /:window/g, Math.ceil(window/1000) + 30 ); // 30 sec of wiggle room
        debug(query);
        this.callMethod('facebook.fql.query', ['query='+query], function(data) {
          for each( var album in data ) {
            var aid      = Number(album.aid),
                size     = Number(album.size),
                modified = Number(album.modified),
                name     = String(album.name),
                link     = decodeURIComponent(escape(String(album.link))),
                owner    = Number(album.owner);
            debug( "Modified album!", owner, name, modified, link );
            var album_owner = fbSvc._friendDict[owner];
            var pvs_album = fbSvc._albumDict[aid];
            if( album_owner ) {
              if( pvs_album ) { // album already existed
                if( size > pvs_album.size ) {
                  fbSvc.showPopup( 'friend.album', 'chrome://facebook/skin/photo.gif',
                                   album_owner.name + ' added new photos to "' + name + '"',
                                   link + "&src=fftb" );
                }
              }
              else {
                fbSvc.showPopup( 'friend.album', 'chrome://facebook/skin/photo.gif',
                                 album_owner.name + ' created the album "' + album.name + '"',
                                 link + "&src=fftb" );
              }
              fbSvc._albumDict[aid] = { 'modified': modified,
                                        'owner': owner,
                                        'size': size };
            }
          }
        });
      }
    },
    checkUsers: function(onInit) {
        var friendUpdate = false;
        var query = ' SELECT uid, name, status, pic_small, pic_square, wall_count, notes_count, profile_update_time'
                  + ' FROM user WHERE uid = :user '
                  + ' OR uid IN (SELECT uid2 FROM friend WHERE uid1 = :user );';
        query = query.replace( /:user/g, this._uid );
        this.callMethod('facebook.fql.query', ['query='+query], function(data) {
            fbSvc._lastCheckedFriends = Date.now();

            // update the friends in place for non-onInit cases
            // because we don't care about removing the defriended ... otherwise we'd
            // make a new friends array every time so that we handle losing friends properly
            friendDict = fbSvc.parseUsers(data);

            var loggedInUser = friendDict[fbSvc._uid];
            if (loggedInUser) {
              debug("loggedInUser", loggedInUser.name);
              delete friendDict[fbSvc._uid];
            }

            // Check for user's info changes
            if (fbSvc._loggedInUser) {
                if (fbSvc._loggedInUser.status != loggedInUser.status) {
                    fbSvc.notify(null, 'facebook-status-updated', loggedInUser.status);
                }
                fbSvc._loggedInUser = loggedInUser;
            } else if (loggedInUser) {
                fbSvc._loggedInUser = loggedInUser;
                fbSvc.notify(fbSvc._loggedInUser, 'facebook-session-start', fbSvc._loggedInUser.id);
                debug('logged in: howdy', fbSvc._loggedInUser.name);
            } else {
                debug("no info for logged-in user", fbSvc._uid);
            }
            debug('check done with logged-in user');

            // Check for user's friends' info changes
            for each (var friend in friendDict) {
                if (!onInit) {
                    if (!fbSvc._friendDict[friend.id]) {
                        fbSvc.notify(friend, 'facebook-new-friend', friend['id']);
                        fbSvc.showPopup('you.friend', friend.pic_sq, friend.name + ' is now your friend',
                        'http://www.facebook.com/profile.php?id=' + friend.id + '&src=fftb');
                        fbSvc._friendCount++; // increment the count
                        friendUpdate = true;
                    } else {
                        notifyProf = true; // only notify if not displaying another notification
                        if (fbSvc._friendDict[friend.id].status != friend.status) {
                            if (friend.status) {
                                if (fbSvc._friendDict[friend.id].stime &&
                                    friend.stime < fbSvc._friendDict[friend.id].stime) {
                                    // weed out bad data using timestamp comparisons ...
                                    debug("stale status update?"
                                          + " NEW: " + friend.stime + ": " + friend.status + " ;"
                                          + " PVS: " + fbSvc._friendDict[friend.id].stime + ": "
                                          + fbSvc._friendDict[friend.id].status );
                                    // ... overwrite the bad data with previous known good data
                                    friend.stime  = fbSvc._friendDict[friend.id].stime;
                                    friend.status = fbSvc._friendDict[friend.id].status;
                                } else {
                                    fbSvc.notify(friend, 'facebook-friend-updated', 'status');
                                    notifyProf = !fbSvc.showPopup('friend.status', friend.pic_sq,
                                        friend.name + ' ' + RenderStatusMsg(friend.status),
                                        'http://www.facebook.com/profile.php?id=' + friend.id + '&src=fftb#status');
                                }
                            } else {
                                fbSvc.notify(friend, 'facebook-friend-updated', 'status-delete');
                            }
                            friendUpdate = true;
                        }
                        if (fbSvc._friendDict[friend.id].wall < friend.wall) {
                            fbSvc.notify(friend, 'facebook-friend-updated', 'wall');
                            notifyProf = notifyProf && !fbSvc.showPopup('friend.wall', friend.pic_sq, 'Someone wrote on ' + friend.name + "'s wall",
                            'http://www.facebook.com/profile.php?id=' + friend.id + '&src=fftb#wall');
                            vdebug('wall count updated', fbSvc._friendDict[friend.id].wall, friend.wall);
                        }
                        if (fbSvc._friendDict[friend.id].notes < friend.notes) {
                            fbSvc.notify(friend, 'facebook-friend-updated', 'notes');
                            notifyProf = notifyProf && !fbSvc.showPopup('friend.note', friend.pic_sq, friend.name + ' wrote a note.',
                              'http://www.facebook.com/notes.php?id=' + friend.id + '&src=fftb');
                            vdebug('note count updated', fbSvc._friendDict[friend.id].notes, friend.notes);
                        }
                        if (fbSvc._friendDict[friend.id].ptime != friend.ptime && 0 != friend.ptime ) {
                            fbSvc.notify(friend, 'facebook-friend-updated', 'profile');
                            if (notifyProf) {
                              fbSvc.showPopup('friend.profile', friend.pic_sq, friend.name + ' updated his/her profile',
                              'http://www.facebook.com/profile.php?id=' + friend.id + '&src=fftb&highlight');
                            }
                            friendUpdate = true;
                        }
                    }
                    fbSvc._friendDict[friend.id] = friend;
                }
            }
            if( onInit )
              fbSvc._friendDict = friendDict;
            if (onInit || friendUpdate) {
                debug('sending notification');
                fbSvc.notify(null, 'facebook-friends-updated', null);
            }
            debug('done checkUsers', friendUpdate);
        });
    },
    getFriends: function(count) {
        debug( "getFriends called!");
        var friend_arr = [];
        for each( var f in fbSvc._friendDict )
          friend_arr.push( f );
        count.value = friend_arr.length;
        return friend_arr;
    },
    notify: function( subject, topic, data ){
        debug( "notify", topic, data );
        this._observerService.notifyObservers( subject, topic, data );
    },
    // deprecated: replaced by fql query in checkUsers
    getUsersInfo: function(users, callback) {
        this.callMethod('facebook.users.getInfo', ['users='+users.join(','),
                        'fields=name,status,pic_small,pic_square,wall_count,notes_count,profile_update_time'],
                        function(data) {
            callback(fbSvc.parseUsers(data));
        });
    },
    generateSig: function (params) {
        var str = '';
        params.sort();
        for (var i = 0; i < params.length; i++) {
            str += params[i];
        }
        str += this._sessionSecret;
        return MD5(str);
    },
    /**
     * Returns common parameters that will always be sent in any request.
     * You should use this when calling the facebook server API yourself (i.e.
     * not using callMethod()).
     *
     * @returns An object with parameter names and values as key and values
     * respectively.
     */
    getCommonParams: function() {
        var callId = Date.now();
        if (callId <= this._lastCallId) {
            callId = this._lastCallId + 1;
        }
        this._lastCallId = callId;
        return {
            'session_key': this._sessionKey,
            'api_key': this._apiKey,
            'v': '1.0',
            'call_id': callId,
            'format': 'json'
        };
    },
    // Note that this is intended to call non-login related Facebook API
    // functions - ie things other than facebook.auth.*.  The login-related
    // calls are done in the chrome layer because they are in direct response to user actions.
    // Also note that this is synchronous so you should not call it from the UI.
    callMethod: function (method, params, callback, secondTry) {
        if (!this._loggedIn) return null;

        var origParams = params.slice(0); // easy way to make a deep copy of the array
        params.push('method=' + method);

        for (let [name, value] in Iterator(this.getCommonParams())) {
            params.push(name + "=" + value);
        }

        params.push('sig=' + this.generateSig(params));

        var paramsEncoded = [];
        for each (var param in params) {
            var idx = param.indexOf("=");
            if (idx < 0) {
                debug("Invalid parameter: " + param);
                return;
            }
            var key = param.slice(0, idx);
            var value = param.slice(idx + 1);
            paramsEncoded.push(key + "=" + encodeURIComponent(value));
        }
        var message = paramsEncoded.join('&');

        //dump("api message: " + message + " \n");

        try {
            // Yuck...xmlhttprequest doesn't always work so we have to do this
            // the hard way.  Thanks to Manish from Flock for the tip!
            var restserver = 'http://api.facebook.com/restserver.php';
            var channel = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService)
                               .newChannel(restserver, null, null)
                               .QueryInterface(Ci.nsIHttpChannel);
            var upStream = Cc['@mozilla.org/io/string-input-stream;1'].createInstance(Ci.nsIStringInputStream);
            upStream.setData(message, message.length);
            channel.QueryInterface(Ci.nsIUploadChannel)
                   .setUploadStream(upStream, "application/x-www-form-urlencoded", -1);
            channel.requestMethod = "POST";
            var listener = {
                onDataAvailable: function(request, context, inputStream, offset, count) {
                    var sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
                    sis.init(inputStream);
                    this.resultTxt += sis.read(count);
                },
                onStartRequest: function(request, context) {
                    debug('starting request', method);
                    this.resultTxt = '';
                    if (fbSvc._pendingRequests.length) {
                        (fbSvc._pendingRequests.shift())();
                    } else {
                        fbSvc._pendingRequest = false;
                    }
                },
                onStopRequest: function(request, context, statusCode) {
                    if (statusCode == Components.results.NS_OK) {
                        var data = null;
                        // native JSON seems to have problems parsing
                        // primitives like "true", "1", etc. as of FF3.1b2
                        try {
                            data = JSON.parse(this.resultTxt);
                        } catch (e) {
                            try {
                                this.resultTxt = this.resultTxt.trim()
                                data = JSON.parse(this.resultTxt);
                            } catch (e) {
                                vdebug("failed to parse: '" + this.resultTxt + "'");
                                if (this.resultTxt == "true") {
                                   data = true;
                                } else if (this.resultTxt == "false") {
                                   data = false;
                                } else {
                                   data = Number(this.resultTxt);
                                   if (NaN == data) {
                                       if (!secondTry) {
                                           debug('TRYING ONE MORE TIME');
                                           fbSvc.callMethod(method, origParams, callback, true);
                                       }
                                       return;
                                   }
                                }
                            }
                        }

                        if (typeof data.error_code != "undefined") {
                            if (data.error_code == 102) {
                                debug('session expired, logging out.');
                                fbSvc.sessionEnd();
                            } else if (data.error_code == 4) {
                                // rate limit hit, let's just cancel this request, we'll try again soon enough.
                                debug('RATE LIMIT ERROR');
                            } else {
                                debug('API error:' + data.error_code);
                                debug(JSON.stringify(data));
                                if (!secondTry) {
                                    debug('TRYING ONE MORE TIME');
                                    fbSvc.callMethod(method, origParams, callback, true);
                                }
                            }
                        } else {
                            callback(data);
                        }
                    }
                }
            };
            if (this._pendingRequest) {
                this._pendingRequests.push(function() {
                    channel.asyncOpen(listener, null);
                });
            } else {
                this._pendingRequest = true;
                channel.asyncOpen(listener, null);
            }
        } catch (e) {
            debug('Exception sending REST request: ', e);
            return null;
        }
    },
    showPopup: function(type, pic, label, url) {
        if (!this._prefService.getBoolPref('extensions.facebook.notifications.toggle') ||
            !this._prefService.getBoolPref('extensions.facebook.notifications.' + type)) {
            return false;
        }
        return this._showPopup(type, pic, label, url);
    },
    _showPopup: function(type, pic, label, url) {
        debug('showPopup', type, pic, label, url);
        try {
            if (!this._alertService)
                this._alertService = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
            if (this._prefService.getBoolPref('extensions.facebook.notifications.growl')) {
                var notifyTitle = this.stringBundle.GetStringFromName("notificationtitle");
                if (url) {
                    this._alertService.showAlertNotification(pic, notifyTitle, label,
                                                             true, url, new AlertObserver() );
                } else {
                    this._alertService.showAlertNotification(pic, notifyTitle, label);
                }
                return true;
            }
        } catch (e) {
            debug('caught', e);
        }

        // either native FF alerts are not available or they aren't being used
        this._numAlertsObj.value++;
        var win = Cc["@mozilla.org/appshell/appShellService;1"]
        .getService(Ci.nsIAppShellService).hiddenDOMWindow;
        var left = win.screen.width - 215;
        var top  = win.screen.height - 105*this._numAlertsObj.value;
        win.openDialog('chrome://facebook/content/notifier.xul', '_blank',
                       'chrome,titlebar=no,popup=yes,left=' + left + ',top=' + top + ',width=210,height=100',
                       pic, label, url, this._numAlertsObj);
        return true;
    }
};

// just copied from lib.js, lame but i don't feel like including the whole
// file in here for this one function.
function RenderStatusMsg(msg) {
    msg = msg.replace(/\s*$/g, '');
    if (msg && '.?!\'"'.indexOf(msg[msg.length-1]) == -1) {
        msg = msg.concat('.');
    }
    return msg;
}

function facebookUser(id, name, pic, pic_sq, status, stime, ptime, notes, wall) {
    this.id     = id;
    this.name   = name;
    this.pic    = pic;
    this.pic_sq = pic_sq;
    this.status = status;
    this.stime  = stime;
    this.ptime  = ptime;
    this.notes  = notes;
    this.wall   = wall;
}
facebookUser.prototype = {
    // nsISupports implementation
    QueryInterface: function (iid) {
        if (!iid.equals(Ci.fbIFacebookUser) &&
            !iid.equals(Ci.nsISupports))
            throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    }
};

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([facebookService]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([facebookService]);

debug('loaded facebook.js');
