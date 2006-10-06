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

function facebookService()
{
    debug('constructor');
    this.apiKey = '64f19267b0e6177ea503046d801c00df';
    this.secret = 'a8a5a57a9f9cd57473797c4612418908';

    this.sessionKey    = null;
    this.sessionSecret = null;
    this.uid           = null;
    this.numMsgs       = 0;
    this.loggedIn      = false;

    var fbSvc = this; // so that poll can access us
    this.poll = {
        notify: function(timer) {
            debug('poll.notify');
            fbSvc.checkMessages();
            // XXX poll for other stuff
        }
    };

    this.observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
}

facebookService.prototype = {
    // nsISupports implementation
    QueryInterface: function (iid) {
        if (!iid.equals(Ci.fbIFacebookService) && 
            !iid.equals(Ci.nsISupports))
            throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    },

    getNumMsgs: function() {
        return this.numMsgs;
    },
    getApiKey: function() {
        return this.apiKey;
    },
    getSecret: function() {
        return this.secret;
    },
    getLoggedIn: function() {
        return this.loggedIn;
    },
    sessionStart: function(sessionKey, sessionSecret, uid) {
        debug('sessionStart');
        this.sessionKey    = sessionKey;
        this.sessionSecret = sessionSecret;
        this.loggedIn      = true;
        this.uid           = uid;

        this.timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this.timer.initWithCallback(this.poll, 300 * 1000, Ci.nsITimer.TYPE_REPEATING_SLACK); // 5 mins

        // fire off another thread to get things started
        this.timer2 = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this.timer2.initWithCallback(this.poll, 1, Ci.nsITimer.TYPE_ONE_SHOT);

        this.observerService.notifyObservers(null, 'facebook-session-start', null);
    },
    sessionEnd: function() {
        debug('sessionEnd');
        this.sessionKey    = null;
        this.sessionSecret = null;
        this.uid           = null;
        this.loggedIn      = false;
        this.numMsgs       = 0;
        this.timer.cancel();
        this.timer2.cancel();

        this.observerService.notifyObservers(null, 'facebook-session-end', null);
    },

    checkMessages: function() {
        debug('checkMessages');
        var data = this.callMethod('facebook.messages.getCount', []);
        // XXX error-check
        var newMsgCount = data.unread;
        // XXX what do we do if someone reads a message and then gets another one in this time interval??
        if (newMsgCount != this.numMsgs) {
            this.numMsgs = newMsgCount;
            this.observerService.notifyObservers(null, 'facebook-new-message', newMsgCount);
        }
        debug('you have ' + this.numMsgs + ' unread messages');
    },

    generateSig: function (params) {
        var str = '';
        params.sort();
        for (var i = 0; i < params.length; i++) {
            str += params[i];
        }
        str += this.sessionSecret;
        return MD5(str);
    },
    // Note that this is intended to call non-login related Facebook API
    // functions - ie things other than facebook.auth.*.  The login-related
    // calls are done in the chrome layer.
    // Also note that this is synchronous so you should not call it from the UI.
    callMethod: function (method, params) {
        if (!this.loggedIn) return null;

        params.push('method=' + method);
        params.push('session_key=' + this.sessionKey);
        params.push('api_key=' + this.apiKey);
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
            var resultText = sis.read(-1);
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
