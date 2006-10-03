var client = new FacebookRestClient();
function startup() {
    if (!client.settings.authToken) {
        client.settings.apiKey = '64f19267b0e6177ea503046d801c00df';
        client.settings.secret = 'a8a5a57a9f9cd57473797c4612418908';
        dump('requesting token\n');
        try {
        client.callMethod('facebook.auth.createToken', [], function(req) {
            dump('received token response:\n');
            dump(req.responseText);
            client.settings.authToken = req.xmldata.token;
            dump('token is: '+client.settings.authToken+'\n');
            document.getElementById('facebook-panel').label = 'logged out';
        });
        } catch (e) {
            dump('exception: ' + e + '\n');
        }
    } else {
        dump('already have token\n');
        if (client.settings.sessionKey) {
            document.getElementById('facebook-panel').label = 'logged in!';
        } else if (client.settings.loginPending) {
            document.getElementById('facebook-panel').label = 'When you are done, click here';
        } else {
            document.getElementById('facebook-panel').label = 'logged out';
        }
    }
}
window.addEventListener('load', startup, false);

function FacebookLogin(statusElem) {
    if (client.settings.sessionKey) {
        dump('already logged in!\n');
    } else if (client.settings.loginPending) {
        dump('FinishLogin called\n');
        client.callMethod('facebook.auth.getSession', ['auth_token='+client.settings.authToken], function(req) {
            dump('received session response:\n');
            dump(req.responseText);
            client.settings.sessionKey = req.xmldata.session_key;
            client.settings.uid        = req.xmldata.uid;
            client.settings.sessionSecret = req.xmldata.secret;
            dump('session: ' + client.settings.sessionKey + ', uid: ' + client.settings.uid + ', secret: ' + client.settings.sessionSecret + '\n');
            statusElem.label  = 'logged in!';
        });
        statusElem.label = '';
    } else if (client.settings.authToken) {
        window.open('http://api.dev005.facebook.com:4750/login.php?api_key=' + client.settings.apiKey +
                    '&auth_token=' + client.settings.authToken);
        statusElem.label = 'When you are done, click here';
        client.settings.loginPending = true;
    } else {
        dump('no authToken\n');
    }
}

dump('loaded sample.js\n');
