var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var observer = {
    observe: function(subject, topic, data) {
        dump('OBSERVING SOMETHING: ' + topic + '\n');
        var panel = document.getElementById('facebook-panel');
        switch (topic) {
            case 'facebook-new-msgs':
                panel.label = data + ' new messages';
                break;
            case 'facebook-new-friend':
                panel.label = data + ' is a new friend!';
                break;
            case 'facebook-new-status':
                subject = subject.QueryInterface(Ci.fbIFacebookUser);
                panel.label = subject.name + ' updated status to ' + subject.status;
                break;
            case 'facebook-session-start':
                panel.label = 'logged in!';
                break;
            case 'facebook-session-end':
                panel.label = 'logged out';
                break;
        }
    }
};

function startup() {
    if (fbSvc.loggedIn) {
        document.getElementById('facebook-panel').label = 'logged in!';
    } else {
        document.getElementById('facebook-panel').label = 'logged out';
    }
    obsSvc.addObserver(observer, 'facebook-new-msgs', false);
    obsSvc.addObserver(observer, 'facebook-session-end', false);
    obsSvc.addObserver(observer, 'facebook-session-start', false);
    obsSvc.addObserver(observer, 'facebook-new-friend', false);
    obsSvc.addObserver(observer, 'facebook-new-status', false);
}
window.addEventListener('load', startup, false);

function shutdown() {
    dump('shutdown\n');
    obsSvc.removeObserver(observer, 'facebook-new-msgs');
    obsSvc.removeObserver(observer, 'facebook-session-end');
    obsSvc.removeObserver(observer, 'facebook-session-start');
    obsSvc.removeObserver(observer, 'facebook-new-friend');
    obsSvc.removeObserver(observer, 'facebook-new-status');
}
window.addEventListener('unload', shutdown, false);

function FacebookLogin(statusElem) {
    if (fbSvc.loggedIn) {
        dump('logging out\n');
        fbSvc.sessionEnd();
    } else {
        // popup login page height is normally 436, but add 20 pixels for the
        // button we show at the bottom of the page
        window.open('chrome://facebook/content/login.xul', '',
                    'chrome,centerscreen,width=626,height=456,modal=yes,dialog=yes,close=no');
    }
}

dump('loaded sample.js\n');
