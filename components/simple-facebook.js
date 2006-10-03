const FB_SVC_CONTRACTID  = '@facebook.com/simple-service;1';
const FB_SVC_CID = '{5b88bfed-0e9e-475d-a3e9-f2c4a5814e8d}';
const FB_SVC_DESC = 'store some basic settings about the fb api connector';

const fbISimpleFacebookService      = Components.interfaces.fbISimpleFacebookService;
const nsISupports                   = Components.interfaces.nsISupports;
const nsIClassInfo                  = Components.interfaces.nsIClassInfo;
const nsITimer                      = Components.interfaces.nsITimer;

function facebookSimpleService()
{
    this.apiKey = null;
    this.secret = null;
    this.authToken = null;
    this.sessionKey = null;
    this.sessionSecret = null;
    this.uid = null;
    this.loginPending = false;
}

facebookSimpleService.prototype = {
    // nsISupports implementation
    QueryInterface: function (iid) {
        if (!iid.equals(fbISimpleFacebookService) && 
            !iid.equals(nsITimer) &&
            !iid.equals(nsIClassInfo) &&
            !iid.equals(nsISupports))
            throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    },

    // nsIClassInfo implementation
    flags: nsIClassInfo.SINGLETON,
    classDescription: FB_SVC_DESC,
    getInterfaces: function(count) {
        var interfaceList = [fbISimpleFacebookService, nsIClassInfo];
        count.value = interfaceList.length;
        return interfaceList;
    },
    getHelperForLanguage: function (count) {return null;},

    // fbISimpleFacebookService implementation
    getApiKey: function() {
        dump('getApiKey' + this.apiKey + '\n');
        return this.apiKey;
    },
    setApiKey: function(apiKey) {
        dump('setApiKey' + apiKey + '\n');
        this.apiKey = apiKey;
    },
    getSecret: function() {
        return this.secret;
    },
    setSecret: function(secret) {
        this.secret = secret;
    },
    getAuthToken: function() {
        return this.authToken;
    },
    setAuthToken: function(authToken) {
        this.authToken = authToken;
    },
    getSessionKey: function() {
        return this.sessionKey;
    },
    setSessionKey: function(sessionKey) {
        this.sessionKey = sessionKey;
    },
    getSessionSecret: function() {
        return this.sessionSecret;
    },
    setSessionSecret: function(sessionSecret) {
        this.sessionSecret = sessionSecret;
    },
    getUid: function() {
        return this.uid;
    },
    setUid: function(uid) {
        this.uid = uid;
    },
    getLoginPending: function() {
        return this.loginPending;
    },
    setLoginPending: function(loginPending) {
        this.loginPending = loginPending
    },
};

// JavaScript XPCOM stuff
function facebookModule (aCID, aContractId, aComponentName, aConstructor) {
    this.mCID = Components.ID (aCID);
    this.mContractId = aContractId;
    this.mComponentName = aComponentName;
    this.mConstructor = aConstructor;

    // factory object
    this.mFactory = {
        constructor: this.mConstructor,
        createInstance: function (aOuter, aIID) {
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
        aCompMgr = aCompMgr.QueryInterface (
                Components.interfaces.nsIComponentRegistrar);
        aCompMgr.registerFactoryLocation (this.mCID, this.mComponentName, 
                this.mContractId, aLocation, aLoaderStr, aType);
    },

    // get the factory                  
    getClassObject: function (aCompMgr, aCID, aIID) {
        if (!aCID.equals (this.mCID)) {
            throw Components.results.NS_ERROR_NO_INTERFACE;
        }

        if (!aIID.equals (Components.interfaces.nsIFactory)) {
            throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
        }

        return this.mFactory;
    },

    canUnload: function(compMgr) {
        return true;
    }
};
// entrypoint
function NSGetModule(compMgr, fileSpec) {
    dump('constructing facebook module\n');
    return new facebookModule(FB_SVC_CID, FB_SVC_CONTRACTID, FB_SVC_DESC, facebookSimpleService);
}
dump('loaded simple-facebook.js\n');
