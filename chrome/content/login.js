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


function debug(s) { dump('** login.js: [' + s + ']\n'); }

var Cc = Components.classes;
var Ci = Components.interfaces;

// load FacebookLoginClient code
Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript('chrome://facebook/content/facebook.js');

var client = new FacebookLoginClient();
var fbns   = new Namespace( "http://api.facebook.com/1.0/" );
function startup() {
    if (client.fbSvc.loggedIn) {
        debug('already logged in!');
        window.close();
    } else if (!client.authToken) {
        debug('requesting token');
        try {
        client.callMethod('facebook.auth.createToken', [], function(req) {
            debug('received token response:');
            debug( req.responseText); 
            client.authToken = req.xmldata;
            debug('token is: '+client.authToken);
            startup();
        });
        } catch (e) {
            debug('exception: ' + e);
        }
    } else {
        var browser = document.getElementById('facebook-login-body');
        var login_base = 'http://www.facebook.com/login.php?popup&v=1.0&api_key=';
        browser.setAttribute('src', login_base +
                             client.fbSvc.apiKey + '&auth_token=' + client.authToken);
        browser.style.display = '';
        document.getElementById('throbber-box').style.display = 'none';
        debug('loading login page');
    }
}
window.addEventListener('load', startup, false);

function done() {
    debug('done()');
    if (!client.authToken) {
        window.close();
        return false;
    }
    debug(client.authToken);
    client.callMethod('facebook.auth.getSession', ['auth_token='+client.authToken], function(req) {
        debug('received session response:');
        debug(req.xmldata);
        var data = req.xmldata;
        var sessionKey    = data.fbns::session_key;
        var sessionSecret = data.fbns::secret;
        var uid           = data.fbns::uid;
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

dump('loaded login.js');
