function debug(s) { dump('** login.js: ' + s + '\n'); }

var Cc = Components.classes;
var Ci = Components.interfaces;

// load FacebookLoginClient code
Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript('chrome://facebook/content/facebook.js');

var client = new FacebookLoginClient();
function startup() {
    if (client.fbSvc.loggedIn) {
        debug('already logged in!');
        window.close();
    } else if (!client.authToken) {
        debug('requesting token');
        try {
        client.callMethod('facebook.auth.createToken', [], function(req) {
            debug('received token response:');
            dump(req.responseText);
            client.authToken = req.xmldata.token;
            debug('token is: '+client.authToken);
            startup();
        });
        } catch (e) {
            debug('exception: ' + e);
        }
    } else {
        document.getElementById('facebook-login-body').
            setAttribute('src', 'http://api.facebook.com/login.php?popup&api_key=' +
                                client.fbSvc.apiKey + '&auth_token=' + client.authToken);
        debug('loading login page');
    }
}
window.addEventListener('load', startup, false);

function done() {
    debug('done()');
    client.callMethod('facebook.auth.getSession', ['auth_token='+client.authToken], function(req) {
        debug('received session response:');
        dump(req.responseText);
        var sessionKey    = req.xmldata.session_key;
        var sessionSecret = req.xmldata.secret;
        var uid           = req.xmldata.uid;
        if (sessionKey && sessionSecret && uid) {
            client.fbSvc.sessionStart(sessionKey, sessionSecret, uid);
            client.authToken  = null;
            debug('session: ' + sessionKey + ', uid: ' + uid + ', secret: ' + sessionSecret);
        }
        window.setTimeout('window.close()', 1);
    });
    // in case the request fails, let's just force a 4 second timeout
    window.setTimeout('window.close()', 4000);
    return false;
}

debug('loaded login.js');
