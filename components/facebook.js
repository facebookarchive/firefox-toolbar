function debug(s) { dump('** facebookService: ' + s + '\n'); }

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

    this._sessionKey    = null;
    this._sessionSecret = null;
    this._uid           = null;
    this._numMsgs       = 0;
    this._numPokes      = 0;
    this._totalPokes    = 0;
    this._loggedIn      = false;

    this._friends       = [];
    this._friendsInfo   = {};
    this._friendsInfoList = [];
    this._friendsDS     = null;

    var fbSvc = this; // so that _poll can access us
    this._poll = {
        notify: function(timer) {
            debug('_poll.notify');
            fbSvc.checkMessages();
            fbSvc.checkPokes();
        }
    };
    this._initialize = {
        notify: function(timer) {
            debug('_initialize.notify');
            fbSvc.loadFriends();
            fbSvc.checkMessages();
            fbSvc.checkPokes();
            fbSvc._observerService.notifyObservers(null, 'facebook-session-start', null);
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
    sessionStart: function(sessionKey, sessionSecret, uid) {
        debug('sessionStart');
        this._sessionKey    = sessionKey;
        this._sessionSecret = sessionSecret;
        this._loggedIn      = true;
        this._uid           = uid;

        this.timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this.timer.initWithCallback(this._poll, 300 * 1000, Ci.nsITimer.TYPE_REPEATING_SLACK); // 5 mins

        // fire off another thread to get things started
        this.timer2 = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this.timer2.initWithCallback(this._initialize, 1, Ci.nsITimer.TYPE_ONE_SHOT);
    },
    sessionEnd: function() {
        debug('sessionEnd');
        this._sessionKey    = null;
        this._sessionSecret = null;
        this._uid           = null;
        this._loggedIn      = false;
        this._numMsgs       = 0;
        this._numPokes      = 0;
        this.timer.cancel();
        this.timer2.cancel();

        this._observerService.notifyObservers(null, 'facebook-session-end', null);
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
    loadFriends: function() {
        // XXX make this support updating your existing list
        debug('loadFriends');
        var data = this.callMethod('facebook.friends.get', []);
        for each (var id in data.result_elt) {
            this._friends.push(id);
        }

        // RDF STUFF
        this._friendsDS = new RDFDataSource(); // could pass in a file name if you want to save it
        var parent = this._friendsDS.getNode('urn:facebook:friends');
        parent.makeBag();
        var USER_RDF_NS = 'http://www.facebook.com/rdf/users#';

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
            user.addTargetOnce(USER_RDF_NS + 'searchname', name.toLowerCase());
            if (status) {
                var firstName = name.substr(0, name.indexOf(' '));
                if (!firstName) firstName = name;
                user.addTargetOnce(USER_RDF_NS + 'status', firstName + ' is ' + status);
                user.addTargetOnce(USER_RDF_NS + 'statustime', stime);
                debug(firstName + ': ' + stime);
            } else {
                user.addTargetOnce(USER_RDF_NS + 'statustime', String(maxdate));
            }
            user.addTargetOnce(USER_RDF_NS + 'pic', pic);
            parent.addChild(user, false);

            var friendObj = { id: id, name: name, lname: name.toLowerCase(), status: status, pic: pic };
            this._friendsInfo[id] = friendObj;
            this._friendsInfoList.push(friendObj);
        }

        //this._friendsDS.flush(); (use this if you are saving to a file)
    },
    getFriends: function(count) {
        count.value = this._friendsInfoList.length;
        return this._friendsInfoList;
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
            debug('received text:');
            dump(resultText);
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

debug('loaded facebook.js');
