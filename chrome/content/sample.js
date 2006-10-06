var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService().QueryInterface(Ci.fbIFacebookService);
function startup() {
    if (fbSvc.loggedIn) {
        document.getElementById('facebook-panel').label = 'logged in!';
    } else {
        document.getElementById('facebook-panel').label = 'logged out';
    }
}
window.addEventListener('load', startup, false);

function FacebookLogin(statusElem) {
    if (fbSvc.loggedIn) {
        dump('logging out\n');
        fbSvc.sessionEnd();
        document.getElementById('facebook-panel').label = 'logged out'; // XXX: move to signal facebook-session-end
    } else {
        window.open('chrome://facebook/content/login.xul', '',
                    'chrome,centerscreen,width=780,height=500,modal=yes,dialog=yes,close=no');
        // since the above is modal the following won't get run until the dialog is closed
        if (fbSvc.loggedIn) {
            document.getElementById('facebook-panel').label = 'logged in!'; // XXX: move to signal facebook-session-start
        }
    }
}

dump('loaded sample.js\n');
