var client = new FacebookRestClient();
function startup() {
    if (client.settings.sessionKey) {
        document.getElementById('facebook-panel').label = 'logged in!';
    } else {
        document.getElementById('facebook-panel').label = 'logged out';
    }
}
window.addEventListener('load', startup, false);

function FacebookLogin(statusElem) {
    if (client.settings.sessionKey) {
        dump('logging out\n');
        client.settings.sessionKey = null;
        document.getElementById('facebook-panel').label = 'logged out';
    } else {
        window.open('chrome://facebook/content/login.xul', '',
                    'chrome,centerscreen,width=780,height=500,modal=yes,dialog=yes,close=no');
        // since the above is modal the following won't get run until the dialog is closed
        if (client.settings.sessionKey) {
            document.getElementById('facebook-panel').label = 'logged in!';
        }
    }
}

dump('loaded sample.js\n');
