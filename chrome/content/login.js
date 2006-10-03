var client = new FacebookRestClient();
function startup() {
    if (client.settings.sessionKey) {
        dump('already logged in!\n');
        window.close();
    } else if (!client.settings.authToken) {
        client.settings.apiKey = '64f19267b0e6177ea503046d801c00df';
        client.settings.secret = 'a8a5a57a9f9cd57473797c4612418908';
        dump('requesting token\n');
        try {
        client.callMethod('facebook.auth.createToken', [], function(req) {
            dump('received token response:\n');
            dump(req.responseText);
            client.settings.authToken = req.xmldata.token;
            dump('token is: '+client.settings.authToken+'\n');
            startup();
        });
        } catch (e) {
            dump('exception: ' + e + '\n');
        }
    } else {
        document.getElementById('facebook-login-body').
            setAttribute('src', 'http://api.facebook.com/login.php?api_key=' +
                                client.settings.apiKey + '&auth_token=' +
                                client.settings.authToken);
        dump('loading login page\n');
    }
}
window.addEventListener('load', startup, false);

function done() {
    dump('done called\n');
    client.callMethod('facebook.auth.getSession', ['auth_token='+client.settings.authToken], function(req) {
        dump('received session response:\n');
        dump(req.responseText);
        client.settings.sessionKey = req.xmldata.session_key;
        client.settings.uid        = req.xmldata.uid;
        client.settings.sessionSecret = req.xmldata.secret;
        client.settings.authToken  = null;
        dump('session: ' + client.settings.sessionKey + ', uid: ' + client.settings.uid + ', secret: ' + client.settings.sessionSecret + '\n');
        window.setTimeout("window.close();",1); // for some reason calling window.close directly does not work
        parent.getElementById('facebook-panel').label = 'logged in!';
    });
}

function ready() {
    dump('readystatechanged\n');
}
dump('loaded login.js\n');
