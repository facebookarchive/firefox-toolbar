var Cc = Components.classes;
var Ci = Components.interfaces;

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);
var obsSvc = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var fbToolbarObserver = {
  observe: function(subject, topic, data) {
    dump('facebook toolbar observing something: ' + topic + '\n');
    switch (topic) {
      case 'facebook-new-message':
        document.getElementById('facebook-notification-msgs').label = data;
        break;
      case 'facebook-new-poke':
        document.getElementById('facebook-notification-poke').label = data;
        break;
      case 'facebook-session-start':
        break;
      case 'facebook-session-end':
        break;
    }
  }
};

var facebook = {
  load: function() {
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-start', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-session-end', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-new-message', false);
    obsSvc.addObserver(fbToolbarObserver, 'facebook-new-poke', false);
    document.getElementById('facebook-notification-msgs').label = fbSvc.numMsgs;
    document.getElementById('facebook-notification-poke').label = fbSvc.numPokes;
    dump('facebook toolbar loaded.\n');
  },

  unload: function() {
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-session-start');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-session-end');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-new-message');
    obsSvc.removeObserver(fbToolbarObserver, 'facebook-new-poke');
    dump('facebook toolbar unloaded.\n');
  },

  get_current_document: function() {
    return document.getElementById('content').selectedBrowser.contentWindow.document;
  },

  go_url: function(url) {
    this.get_current_document().location.href=url;
  }
};
window.addEventListener('load', facebook.load, false);
window.addEventListener('unload', facebook.unload, false);

dump('loaded toolbar.js\n');
