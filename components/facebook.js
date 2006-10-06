function debug(s) { dump('** facebookService: ' + s + '\n'); }

const FB_SVC_CONTRACTID  = '@facebook.com/facebook-service;1';
const FB_SVC_CID         = '{e983db0e-05fc-46e7-9fba-a22041c894ac}';
const FB_SVC_DESC        = 'Facebook API Connector';

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
}

facebookService.prototype = {
    // nsISupports implementation
    QueryInterface: function (iid) {
        if (!iid.equals(Ci.fbIFacebookService) && 
            !iid.equals(Ci.nsIClassInfo) &&
            !iid.equals(Ci.nsISupports))
            throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    },

    // nsIClassInfo implementation
    flags: Ci.nsIClassInfo.SINGLETON,
    classDescription: FB_SVC_DESC,
    getInterfaces: function(count) {
        debug('getInterfaces');
        var interfaceList = [Ci.fbIFacebookService, Ci.nsIClassInfo];
        count.value = interfaceList.length;
        return interfaceList;
    },
    getHelperForLanguage: function (count) {return null;},

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
    },
    sessionEnd: function() {
        debug('sessionEnd');
        this.sessionKey    = null;
        this.sessionSecret = null;
        this.uid           = null;
        this.loggedIn      = false;
        this.timer.cancel();
        this.timer2.cancel();
    },

    checkMessages: function() {
        debug('checkMessages');
        var data = this.callMethod('facebook.messages.getCount', []);
        // XXX error-check
        var newMsgCount = data.unread;
        if (!this.numMsgs || newMsgCount > this.numMsgs) {
            this.numMsgs = newMsgCount;
            // XXX fire signal facebook-new-message
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

// JavaScript XPCOM stuff
function facebookModule (aCID, aContractId, aComponentName, aConstructor) {
    debug('module constructor');
    this.mCID = Components.ID (aCID);
    this.mContractId = aContractId;
    this.mComponentName = aComponentName;
    this.mConstructor = aConstructor;

    // factory object
    this.mFactory = {
        constructor: this.mConstructor,
        createInstance: function (aOuter, aIID) {
            debug('createInstance');
            if (aOuter != null) {
                throw Components.results.NS_ERROR_NO_AGGREGATION;
            }

            return (new (this.constructor) ()).QueryInterface (aIID);
        }
    };
}
facebookModule.prototype = {
    // the module should register itself
    registerSelf: function (aCompMgr, aLocation, aLoaderStr, aType) {
        debug('registerSelf');
        aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
        aCompMgr.registerFactoryLocation(this.mCID, this.mComponentName, this.mContractId,
                                         aLocation, aLoaderStr, aType);

        // make the service get constructed at app-startup
        var catMan = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
        catMan.addCategoryEntry("app-startup", this.mComponentName, "service," + this.mContractId, true, true, null);
    },

    unregisterSelf: function(aCompMgr, aLocation, aType) {
        debug('unregisterSelf');
        var catMan = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
        catMan.deleteCategoryEntry("app-startup", "service," + this.mContractId, true);

        aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
        aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);        
    },

    // get the factory                  
    getClassObject: function (aCompMgr, aCID, aIID) {
        debug('getClassObject');
        if (!aCID.equals (this.mCID)) {
            throw Components.results.NS_ERROR_NO_INTERFACE;
        }

        if (!aIID.equals (Ci.nsIFactory)) {
            throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
        }

        return this.mFactory;
    },

    canUnload: function(compMgr) {
        debug('canUnload');
        return true;
    }
};
// entrypoint
function NSGetModule(compMgr, fileSpec) {
    debug('NSGetModule');
    return new facebookModule(FB_SVC_CID, FB_SVC_CONTRACTID, FB_SVC_DESC, facebookService);
}

debug('loaded facebook.js');
