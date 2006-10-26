const FRIEND_CHECK_INTERVAL = 15*60*1000;
const MSG_CHECK_INTERVAL    = 5*60*1000;

const VERBOSITY = 1; // 0: no dumping, 1: normal dumping, 2: massive dumping

function debug() {
  if (VERBOSITY == 0) return;
  dump('facebookService: ');
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

const CONTRACT_ID  = '@facebook.com/facebook-service;1';
const CLASS_ID     = Components.ID('{e983db0e-05fc-46e7-9fba-a22041c894ac}');
const CLASS_NAME   = 'Facebook API Connector';

var Cc = Components.classes;
var Ci = Components.interfaces;

// Load MD5 code...
Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript('chrome://facebook/content/md5.js');

function facebookService()
{
    debug('constructor');

    this._apiKey = '64f19267b0e6177ea503046d801c00df';
    this._secret = 'a8a5a57a9f9cd57473797c4612418908';

    this.initValues();

    var fbSvc = this; // so that our timer callback objects can access us
    this._msgChecker = {
        notify: function(timer) {
            debug('_msgChecker.notify');
            fbSvc.checkMessages();
            fbSvc.checkPokes();
            fbSvc.checkReqs();
        }
    };
    this._friendChecker = {
        notify: function(timer) {
            debug('_friendChecker.notify');
            fbSvc.checkFriends();
        }
    };
    this._initialize = {
        notify: function(timer) {
            debug('_initialize.notify');
            fbSvc.getMyInfo();
            fbSvc._observerService.notifyObservers(fbSvc._loggedInUser, 'facebook-session-start',
                                                   fbSvc._loggedInUser.id);
            fbSvc.checkMessages();
            fbSvc.checkPokes();
            fbSvc.checkReqs();
            fbSvc._holdFriendNotifications = true;
            fbSvc.checkFriends();
            fbSvc._holdFriendNotifications = false;
        }
    };

    this._observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
}

facebookService.prototype = {
    // nsISupports implementation
    QueryInterface: function (iid) {
        if (!iid.equals(Ci.fbIFacebookService) && 
            !iid.equals(Ci.nsISupports))
            throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    },

    get numMsgs() {
        return this._numMsgs;
    },
    get numPokes() {
        return this._numPokes;
    },
    get numReqs() {
        return this._numReqs;
    },
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
    sessionStart: function(sessionKey, sessionSecret, uid) {
        debug('sessionStart');
        if (!sessionKey || !sessionSecret || !uid) return;
        this._sessionKey    = sessionKey;
        this._sessionSecret = sessionSecret;
        this._loggedIn      = true;
        this._uid           = uid;

        this.timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this.timer.initWithCallback(this._msgChecker, MSG_CHECK_INTERVAL, Ci.nsITimer.TYPE_REPEATING_SLACK);

        this.timer2 = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this.timer2.initWithCallback(this._friendChecker, FRIEND_CHECK_INTERVAL, Ci.nsITimer.TYPE_REPEATING_SLACK);

        // fire off another thread to get things started
        this.timer3 = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this.timer3.initWithCallback(this._initialize, 1, Ci.nsITimer.TYPE_ONE_SHOT);
    },
    sessionEnd: function() {
        debug('sessionEnd');

        this.initValues();
        this.timer.cancel();
        this.timer2.cancel();
        this.timer3.cancel();

        this._observerService.notifyObservers(null, 'facebook-session-end', null);
    },
    initValues: function() {
        this._sessionKey    = null;
        this._sessionSecret = null;
        this._uid           = null;
        this._loggedIn      = false;
        this._loggedInUser  = null;
        this._numMsgs       = 0;
        this._lastMsgTime   = 0;
        this._numPokes      = 0;
        this._numReqs       = 0;
        this._reqs          = [];
        this._reqsInfo      = {};
        this._totalPokes    = 0;
        this._friendsInfo   = {};
        this._friendsInfoArr = [];
    },

    checkMessages: function() {
        var data = this.callMethod('facebook.messages.getCount', []);
        var newMsgCount = data.unread;
        if (data.most_recent > this._lastMsgTime) {
            this._observerService.notifyObservers(null, 'facebook-new-msgs', newMsgCount);
            this._lastMsgTime = data.most_recent;
        }
        if (newMsgCount != this._numMsgs) {
            this._observerService.notifyObservers(null, 'facebook-msgs-updated', newMsgCount);
            this._numMsgs = newMsgCount;
        }
        debug('checkMessages: you have ' + this._numMsgs + ' unread messages');
    },
    checkPokes: function() {
        var data = this.callMethod('facebook.pokes.getCount', []);
        var newPokeCount = data.unseen;
        var totalPokeCount = data.total;
        if (totalPokeCount > this._totalPokes && newPokeCount > 0) {
            // we send the notification if you have any unseen pokes and the total # of pokes has gone up.
            // note that your unseen poke count could theoretically stay the same or even if you have new pokes.
            this._totalPokes = totalPokeCount;
            this._observerService.notifyObservers(null, 'facebook-new-poke', newPokeCount);
        }
        if (newPokeCount != this._numPokes) {
            this._numPokes = newPokeCount;
            this._observerService.notifyObservers(null, 'facebook-pokes-updated', newPokeCount);
        }
        debug('checkPokes: you have ' + this._numPokes + ' unseen pokes');
    },
    checkReqs: function() {
        var data = this.callMethod('facebook.friends.getRequests', []);
        var newReqCount = data.result_elt.length();
        var reqsToGet = [];
        for each (var id in data.result_elt) {
            if (!this._reqsInfo[id]) {
                reqsToGet.push(id);
            }
        }
        if (reqsToGet.length > 0) {
            this._reqsInfo = this.getUsersInfo(reqsToGet);
            for each (var reqInfo in this._reqsInfo) {
                this._observerService.notifyObservers(reqInfo, 'facebook-new-req', reqInfo['id']);
            }
        }
        if (newReqCount != this._numReqs) {
            this._numReqs = newReqCount;
            this._observerService.notifyObservers(null, 'facebook-reqs-updated', newReqCount);
        }
        debug('checkReqs: you have ' + this._numReqs + ' outstanding reqs');
    },
    checkFriends: function() {
        debug('checkFriends');
        var friendUpdate = false;
        var data = this.callMethod('facebook.friends.get', []);
        // make a new friends array every time so that we handle losing friends properly
        var friends = [];
        for each (var id in data.result_elt) {
            friends.push(id);
        }

        var friendsInfo = this.getUsersInfo(friends);
        var friendsInfoArr = [];

        for each (var friend in friendsInfo) {
            if (!this._holdFriendNotifications) {
                if (!this._friendsInfo[friend['id']]) {
                    this._observerService.notifyObservers(friend, 'facebook-new-friend', friend['id']);
                    friendUpdate = true;
                } else if (this._friendsInfo[friend['id']].status != friend['status']) {
                    this._observerService.notifyObservers(friend, 'facebook-friend-updated', friend['id']);
                    friendUpdate = true;
                }
            }
            friendsInfoArr.push(friend);
        }
        this._friendsInfo = friendsInfo;
        this._friendsInfoArr = friendsInfoArr;

        if (this._holdFriendNotifications || friendUpdate) {
            debug('sending notification');
            this._observerService.notifyObservers(null, 'facebook-friends-updated', null);
        }
        debug('done checkFriends', friendUpdate);
    },
    getFriends: function(count) {
        count.value = this._friendsInfoArr.length;
        return this._friendsInfoArr;
    },
    getMyInfo: function() {
        this._loggedInUser = this.getUsersInfo([this._uid])[this._uid];
        debug('getMyInfo: hello', this._loggedInUser['name']);
    },
    getUsersInfo: function(users) {
        var data = this.callMethod('facebook.users.getInfo', ['users='+users.join(','), 'fields=name,status,pic']);
        var usersInfo = {};
        for each (var user in data.result_elt) {
            var name   = String(user.name),
                id     = String(user.@id),
                status = String(user.status.message),
                stime  = parseInt(user.status.time),
                pic    = String(decodeURI(user.pic)) + '&size=thumb';
            usersInfo[id] = new facebookUser(id, name, pic, status, stime);
        }
        return usersInfo;
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
    // Note that this is intended to call non-login related Facebook API
    // functions - ie things other than facebook.auth.*.  The login-related
    // calls are done in the chrome layer.
    // Also note that this is synchronous so you should not call it from the UI.
    callMethod: function (method, params) {
        if (!this._loggedIn) return null;

        params.push('method=' + method);
        params.push('session_key=' + this._sessionKey);
        params.push('api_key=' + this._apiKey);
        params.push('call_id=' + (new Date()).getTime());
        params.push('sig=' + this.generateSig(params));
        var message = params.join('&');

        try {
            debug('about to call method', method);
            // Yuck...xmlhttprequest doesn't always work so we have to do this
            // the hard way.  Thanks to Manish from Flock for the tip!
            var channel = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService)
                               .newChannel('http://api.facebook.com/restserver.php', null, null)
                               .QueryInterface(Ci.nsIHttpChannel);
            var upStream = Cc['@mozilla.org/io/string-input-stream;1'].createInstance(Ci.nsIStringInputStream);
            upStream.setData(message, message.length);
            channel.QueryInterface(Ci.nsIUploadChannel)
                   .setUploadStream(upStream, "application/x-www-form-urlencoded", -1);
            channel.requestMethod = "POST";
            var downStream = channel.open();
            var sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
            sis.init(downStream);
            var txt, resultText = '';
            while (txt = sis.read(-1)) {
                resultText += txt;
            }
            resultText = resultText.substr(resultText.indexOf("\n") + 1);
            if (VERBOSITY == 2) {
              debug('received text:');
              dump(resultText);
            }
            var xmldata = new XML(resultText);
            if ((String)(xmldata.fb_error.code)) { // need to cast to string or else the check will never fail
                throw xmldata.fb_error;
            }
            return xmldata;
        } catch (e) {
            if (e.code == 102) {
                debug('session expired, logging out.');
                this.sessionEnd();
            }
            debug('Exception sending REST request: ', e);
            return null;
        }
    },
};

// boilerplate stuff
var facebookFactory = {
    createInstance: function (aOuter, aIID) {
        debug('createInstance');
        if (aOuter != null) {
            throw Components.results.NS_ERROR_NO_AGGREGATION;
        }
        return (new facebookService()).QueryInterface (aIID);
    }
};
var facebookModule = {
    registerSelf: function (aCompMgr, aFileSpec, aLocation, aType) {
        debug('registerSelf');
        aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
        aCompMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, CONTRACT_ID, aFileSpec, aLocation, aType);
    },
    unregisterSelf: function(aCompMgr, aLocation, aType) {
        debug('unregisterSelf');
        aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
        aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);        
    },
    getClassObject: function (aCompMgr, aCID, aIID) {
        debug('getClassObject');
        if (!aIID.equals (Ci.nsIFactory))
            throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

        if (aCID.equals (CLASS_ID))
            return facebookFactory;

        throw Components.results.NS_ERROR_NO_INTERFACE;
    },
    canUnload: function(compMgr) {
        debug('canUnload');
        return true;
    }
};
function NSGetModule(compMgr, fileSpec) {
    debug('NSGetModule');
    return facebookModule;
}

function facebookUser(id, name, pic, status, stime) {
    this.id     = id;
    this.name   = name;
    this.pic    = pic;
    this.status = status;
    this.stime  = stime;
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

debug('loaded facebook.js');
