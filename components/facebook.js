const FRIEND_CHECK_INTERVAL = 15*60*1000;
const MSG_CHECK_INTERVAL    = 5*60*1000;
const USER_RDF_NS = 'http://www.facebook.com/rdf/users#';

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

// Load RDF code...
Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript('chrome://facebook/content/rdflib.js');

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
    get apiKey() {
        return this._apiKey;
    },
    get secret() {
        return this._secret;
    },
    get loggedIn() {
        return this._loggedIn;
    },
    get friendsRdf() {
        if (this._friendsDS) {
            return this._friendsDS.getRawDataSource();
        } else {
            return null;
        }
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
        this._numPokes      = 0;
        this._totalPokes    = 0;
        this._friends       = [];
        this._friendsInfo   = {};
        this._friendsDS     = null;
    },

    checkMessages: function() {
        debug('checkMessages');
        var data = this.callMethod('facebook.messages.getCount', []);
        // XXX error-check
        var newMsgCount = data.unread;
        // XXX what do we do if someone reads a message and then gets another one in this time interval??
        if (newMsgCount != this._numMsgs) {
            this._numMsgs = newMsgCount;
            this._observerService.notifyObservers(null, 'facebook-new-message', newMsgCount);
        }
        debug('you have ' + this._numMsgs + ' unread messages');
    },
    checkPokes: function() {
        debug('checkPokes');
        var data = this.callMethod('facebook.pokes.getCount', []);
        // XXX error-check
        var newPokeCount = data.unseen;
        var totalPokeCount = data.total;
        if (totalPokeCount > this._totalPokes && newPokeCount > 0) {
            // we send the notification if you have any unseen pokes and the total # of pokes has gone up.
            // note that your unseen poke count could theoretically stay the same or even if you have new pokes.
            this._numPokes = newPokeCount;
            this._totalPokes = totalPokeCount;
            this._observerService.notifyObservers(null, 'facebook-new-poke', newPokeCount);
        }
        debug('you have ' + this._numPokes + ' unseen pokes');
    },
    checkFriends: function() {
        debug('checkFriends');
        var friendUpdate = false;
        var data = this.callMethod('facebook.friends.get', []);
        for each (var id in data.result_elt) {
            if (!this._friendsInfo[id]) {
                if (!this._holdFriendNotifications) {
                    this._observerService.notifyObservers(null, 'facebook-new-friend', id);
                }
                this._friends.push(id);
                friendUpdate = true;
            }
        }

        // RDF STUFF
        this._friendsDS = new RDFDataSource(); // could pass in a file name if you want to save it
        var parent = this._friendsDS.getNode('urn:facebook:friends');
        parent.makeBag();

        data = this.callMethod('facebook.users.getInfo', ['users='+this._friends.join(','), 'fields=name,status,pic']);

        // We want status times to be sorted in descending order, but we are doing an alphabetical
        // sort on them via RDF (so that the secondary sort by name works).  So we need all of the
        // status times to have the same # of characters in order for alphabetical sort to work and
        // we want the most recent update to have the smallest number so it will show up first.  So
        // we make a maxdate which corresponds to somewhere in the year 33658 and subtract from
        // there.  We picked maxdate such that it would not lose any digits during this subtraction
        // so that the sort will work properly.  Note: this code is not Y33K compliant.
        const maxdate = 999999999999;
        for each (var friend in data.result_elt) {
            var name   = String(friend.name),
                id     = String(friend.@id),
                status = String(friend.status.message),
                stime  = String(maxdate-parseInt(friend.status.time)), // note maxdate
                pic    = String(decodeURI(friend.pic));

            // RDF STUFF
            var user = this._friendsDS.getNode('urn:facebook:users:'+id);
            user.addTargetOnce(USER_RDF_NS + 'id', id);
            user.addTargetOnce(USER_RDF_NS + 'name', name);
            if (status) {
                var firstName = name.substr(0, name.indexOf(' '));
                if (!firstName) firstName = name;
                user.addTargetOnce(USER_RDF_NS + 'status', firstName + ' is ' + status);
                user.addTargetOnce(USER_RDF_NS + 'statustime', stime);
            } else {
                user.addTargetOnce(USER_RDF_NS + 'statustime', String(maxdate));
            }
            user.addTargetOnce(USER_RDF_NS + 'pic', pic);
            parent.addChild(user, false);

            var friendObj = new facebookUser(id, name, pic, status);
            if (this._friendsInfo[id] && this._friendsInfo[id].status != status) {
                if (!this._holdFriendNotifications) {
                    this._observerService.notifyObservers(friendObj, 'facebook-new-status', id);
                }
                friendUpdate = true;
            }
            this._friendsInfo[id] = friendObj;
        }
        //this._friendsDS.flush(); (use this if you are saving to a file)
        if (friendUpdate) {
            this._observerService.notifyObservers(null, 'facebook-friends-updated', null);
        }
        debug('done checkFriends', friendUpdate);
    },
    getFriends: function(count) {
        var list = [];
        for each (var friendObj in this._friendsInfo) {
            list.push(friendObj);
        }
        count.value = list.length;
        return list;
    },
    getMyInfo: function() {
        debug('getMyInfo');
        var data = this.callMethod('facebook.users.getInfo', ['users='+this._uid, 'fields=name,status,pic']);
        var myData = data.result_elt;
        var name   = String(myData.name),
            id     = String(myData.@id),
            status = String(myData.status.message),
            pic    = String(decodeURI(myData.pic));
        this._loggedInUser = new facebookUser(id, name, pic, status);
        debug('hello', name);
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
            return xmldata;
        } catch (e) {
            debug('Exception sending REST request: ' + e);
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

function facebookUser(id, name, pic, status) {
    this.id     = id;
    this.name   = name;
    this.pic    = pic;
    this.status = status;
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
