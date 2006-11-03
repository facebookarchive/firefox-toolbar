const BASE_CHECK_INTERVAL = 5*60*1000;

const VERBOSITY = 1; // 0: no dumping, 1: normal dumping, 2: massive dumping

function debug() {
  if (VERBOSITY == 0) return;
  dump('facebookService: ');
  if (debug.caller && debug.caller.name) {
    dump(debug.caller.name + ':\t');
  } else {
    dump('\t\t');
  }
  for (var i = 0; i < arguments.length; i++) {
    if (i > 0) dump(', ');
    dump(arguments[i]);
  }
  dump('\n');
}

const CONTRACT_ID  = '@facebook.com/facebook-service;1';
const CLASS_ID     = Components.ID('{e983db0e-05fc-46e7-9fba-a22041c894ac}');
const CLASS_NAME   = 'Facebook API Connector';

var Cc = Components.classes;
var Ci = Components.interfaces;

// Load MD5 code...
Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript('chrome://facebook/content/md5.js');

var fbSvc; // so that all our callback functions objects can access "this"
function facebookService()
{
    debug('constructor');

    this._apiKey = '8d7be0a45c164647647602a27106cc65';
    this._secret = 'c9646e8dccec4c2726c65f6f5eeca86a';

    this.initValues();

    fbSvc = this;
    this._checker = {
        notify: function(timer) {
            var now = (new Date()).getTime();
            // only do a check if either: 
            //   1. we loaded an fb page in the last minute
            if ((fbSvc._lastFBLoad > fbSvc._lastChecked) ||
            //   2. or we haven't checked in the last 5 minutes and any page has loaded
                (fbSvc._lastPageLoad > fbSvc._lastChecked && now > fbSvc._lastChecked + BASE_CHECK_INTERVAL) ||
            //   3. or we haven't checked in the last 10 minutes and no page has loaded
                (now > fbSvc._lastChecked + BASE_CHECK_INTERVAL*2)) {
                fbSvc._lastChecked = now;
                debug('_checker.notify: checking', now, fbSvc._lastFBLoad, fbSvc._lastPageLoad, fbSvc._lastChecked);
                fbSvc.getMyInfo(false); // to check for wall posts
                fbSvc.checkMessages(false);
                fbSvc.checkPokes(false);
                fbSvc.checkReqs(false);
                fbSvc.checkFriends(false);
            } else {
                debug('_checker.notify: skipping', now, fbSvc._lastFBLoad, fbSvc._lastPageLoad, fbSvc._lastChecked);
            }
        }
    };
    this._initialize = {
        notify: function(timer) {
            debug('_initialize.notify');
            fbSvc._lastChecked = (new Date()).getTime();
            fbSvc.getMyInfo(true);
            fbSvc.checkMessages(true);
            fbSvc.checkPokes(true);
            fbSvc.checkReqs(true);
            fbSvc.checkFriends(true);
        }
    };
    this._alertObserver = {
        observe: function(subject, topic, data) {
            debug('observed', subject, topic, data);
            if (topic == 'alertclickcallback') {
                debug('opening url', data);
                var window = fbSvc._winService.getMostRecentWindow(null);
                window.open(data);
            }
        }
    };
    this._numAlertsObj = { value: 0 };

    this._winService      = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    this._observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    this._prefService     = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
}

facebookService.prototype = {
    // nsISupports implementation
    QueryInterface: function (iid) {
        if (!iid.equals(Ci.fbIFacebookService) && 
            !iid.equals(Ci.nsISupports))
            throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    },

    get numMsgs() {
        return this._numMsgs;
    },
    get numPokes() {
        return this._numPokes;
    },
    get numReqs() {
        return this._numReqs;
    },
    get apiKey() {
        return this._apiKey;
    },
    get secret() {
        return this._secret;
    },
    get loggedIn() {
        return this._loggedIn;
    },
    get loggedInUser() {
        return this._loggedInUser;
    },
    sessionStart: function(sessionKey, sessionSecret, uid) {
        debug('sessionStart');
        if (!sessionKey || !sessionSecret || !uid) return;
        this._sessionKey    = sessionKey;
        this._sessionSecret = sessionSecret;
        this._loggedIn      = true;
        this._uid           = uid;

        this._timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this._timer.initWithCallback(this._checker, BASE_CHECK_INTERVAL/5, Ci.nsITimer.TYPE_REPEATING_SLACK);

        // fire off another thread to get things started
        this._oneShotTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this._oneShotTimer.initWithCallback(this._initialize, 1, Ci.nsITimer.TYPE_ONE_SHOT);
    },
    sessionEnd: function() {
        debug('sessionEnd');

        this.initValues();

        this._timer.cancel();
        this._oneShotTimer.cancel();

        this._observerService.notifyObservers(null, 'facebook-session-end', null);
    },
    hintPageLoad: function(fbPage) {
        var now = (new Date()).getTime();
        if (fbPage) {
            this._lastFBLoad = now;
        } else {
            this._lastPageLoad = now;
        }
    },
    initValues: function() {
        this._sessionKey    = null;
        this._sessionSecret = null;
        this._uid           = null;
        this._loggedIn      = false;
        this._loggedInUser  = null;
        this._numMsgs       = 0;
        this._lastMsgTime   = 0;
        this._numPokes      = 0;
        this._numReqs       = 0;
        this._reqs          = [];
        this._reqsInfo      = {};
        this._totalPokes    = 0;
        this._friendsInfo   = {};
        this._friendsInfoArr = [];
        this._pendingRequest = false;
        this._pendingRequests = [];
        this._lastCallId     = 0;
        this._lastChecked    = 0;
        this._lastFBLoad     = 0;
        this._lastPageLoad   = 0;
    },

    checkMessages: function(holdNotifications) {
        this.callMethod('facebook.messages.getCount', [], function(data) {
            var newMsgCount = data.unread;
            if (!holdNotifications && data.most_recent > fbSvc._lastMsgTime && newMsgCount > 0) {
                fbSvc._observerService.notifyObservers(null, 'facebook-new-msgs', newMsgCount);
                if (newMsgCount > 1) {
                    fbSvc.showPopup('you.msg', 'http://static.ak.facebook.com/images/feed_icons/aaron_color/s/poke.gif',
                                    'You have new messages', 'http://www.facebook.com/mailbox.php');
                } else {
                    fbSvc.showPopup('you.msg', 'http://static.ak.facebook.com/images/feed_icons/aaron_color/s/poke.gif',
                                    'You have a new message', 'http://www.facebook.com/mailbox.php');
                }
                fbSvc._lastMsgTime = data.most_recent;
            }
            if (newMsgCount != fbSvc._numMsgs) {
                fbSvc._observerService.notifyObservers(null, 'facebook-msgs-updated', newMsgCount);
                fbSvc._numMsgs = newMsgCount;
            }
            debug('checkMessages: you have ' + fbSvc._numMsgs + ' unread messages');
        });
    },
    checkPokes: function(holdNotifications) {
        this.callMethod('facebook.pokes.getCount', [], function(data) {
            var newPokeCount = data.unseen;
            var totalPokeCount = data.total;
            if (!holdNotifications && totalPokeCount > fbSvc._totalPokes && newPokeCount > 0) {
                // we send the notification if you have any unseen pokes and the total # of pokes has gone up.
                // note that your unseen poke count could theoretically stay the same or even if you have new pokes.
                fbSvc._totalPokes = totalPokeCount;
                fbSvc._observerService.notifyObservers(null, 'facebook-new-poke', newPokeCount);
                fbSvc.showPopup('you.poke', 'http://static.ak.facebook.com/images/feed_icons/aaron_color/s/poke.gif',
                                'You have been poked', 'http://www.facebook.com/home.php');
            }
            if (newPokeCount != fbSvc._numPokes) {
                fbSvc._numPokes = newPokeCount;
                fbSvc._observerService.notifyObservers(null, 'facebook-pokes-updated', newPokeCount);
            }
            debug('checkPokes: you have ' + fbSvc._numPokes + ' unseen pokes');
        });
    },
    checkReqs: function(holdNotifications) {
        this.callMethod('facebook.friends.getRequests', [], function(data) {
            var newReqCount = data.result_elt.length();
            var reqsToGet = [];
            for each (var id in data.result_elt) {
                if (!fbSvc._reqsInfo[id]) {
                    reqsToGet.push(id);
                }
            }
            if (reqsToGet.length > 0) {
                fbSvc.getUsersInfo(reqsToGet, function(users) {
                    for each (var reqInfo in users) {
                        fbSvc._reqsInfo[reqInfo.id] = reqInfo;
                        if (!holdNotifications) {
                            fbSvc._observerService.notifyObservers(reqInfo, 'facebook-new-req', reqInfo.id);
                            fbSvc.showPopup('you.req', reqInfo.pic, reqInfo.name + ' wants to be your friend',
                                           'http://www.facebook.com/reqs.php');
                        }
                    }
                });
            }
            if (newReqCount != fbSvc._numReqs) {
                fbSvc._numReqs = newReqCount;
                fbSvc._observerService.notifyObservers(null, 'facebook-reqs-updated', newReqCount);
            }
            debug('checkReqs: you have ' + fbSvc._numReqs + ' outstanding reqs');
        });
    },
    checkFriends: function(holdNotifications) {
        var friendUpdate = false;
        this.callMethod('facebook.friends.get', [], function(data) {
            // make a new friends array every time so that we handle losing friends properly
            var friends = [];
            for each (var id in data.result_elt) {
                friends.push(id);
            }

            fbSvc.getUsersInfo(friends, function(friendsInfo) {
                var friendsInfoArr = [];

                for each (var friend in friendsInfo) {
                    if (!holdNotifications) {
                        if (!fbSvc._friendsInfo[friend['id']]) {
                            fbSvc._observerService.notifyObservers(friend, 'facebook-new-friend', friend['id']);
                            fbSvc.showPopup('you.friend', friend.pic, friend.name + ' is now your friend',
                                            'http://www.facebook.com/profile.php?uid=' + friend.id + '&api_key=' + fbSvc._apiKey);
                            friendUpdate = true;
                        } else {
                            if (fbSvc._friendsInfo[friend.id].status != friend.status) {
                                if (friend.status) {
                                    fbSvc._observerService.notifyObservers(friend, 'facebook-friend-updated', 'status');
                                    fbSvc.showPopup('friend.status', friend.pic, friend.name + ' is now ' + RenderStatusMsg(friend.status),
                                                    'http://www.facebook.com/profile.php?uid=' + friend.id + '&api_key=' + fbSvc._apiKey);
                                } else {
                                    fbSvc._observerService.notifyObservers(friend, 'facebook-friend-updated', 'status-delete');
                                }
                                friendUpdate = true;
                            }
                            if (fbSvc._friendsInfo[friend.id].wall != friend.wall) {
                                fbSvc._observerService.notifyObservers(friend, 'facebook-friend-updated', 'wall');
                                fbSvc.showPopup('friend.wall', friend.pic, 'Someone wrote on ' + friend.name + "'s wall",
                                                'http://www.facebook.com/profile.php?uid=' + friend.id + '&api_key=' + fbSvc._apiKey);
                            }
                            if (fbSvc._friendsInfo[friend.id].notes != friend.notes) {
                                fbSvc._observerService.notifyObservers(friend, 'facebook-friend-updated', 'notes');
                                fbSvc.showPopup('friend.note', friend.pic, friend.name + ' wrote a note.',
                                                'http://www.facebook.com/notes.php?uid=' + friend.id + '&api_key=' + fbSvc._apiKey);
                            }
                        }
                    }
                    friendsInfoArr.push(friend);
                }
                fbSvc._friendsInfo = friendsInfo;
                fbSvc._friendsInfoArr = friendsInfoArr;

                if (holdNotifications || friendUpdate) {
                    debug('sending notification');
                    fbSvc._observerService.notifyObservers(null, 'facebook-friends-updated', null);
                }
                debug('done checkFriends', friendUpdate);
            });
        });
    },
    getFriends: function(count) {
        count.value = this._friendsInfoArr.length;
        return this._friendsInfoArr;
    },
    getMyInfo: function() {
        this.getUsersInfo([this._uid], function(users) {
            if (fbSvc._loggedInUser) {
                var user = users[fbSvc._uid];
                if (fbSvc._loggedInUser.wall != user.wall) {
                    fbSvc._observerService.notifyObservers(null, 'facebook-wall-updated', user.wall);
                    if (fbSvc._loggedInUser.wall < user.wall) {
                        fbSvc.showPopup('you.wall', '', 'Someone wrote on your wall',
                                        'http://www.facebook.com/profile.php?uid=' + user.id + '&api_key=' + fbSvc._apiKey);
                    }
                }
                fbSvc._loggedInUser = user;
            } else {
                fbSvc._loggedInUser = users[fbSvc._uid];
                fbSvc._observerService.notifyObservers(fbSvc._loggedInUser, 'facebook-session-start',
                                                       fbSvc._loggedInUser.id);
                debug('getMyInfo: hello', fbSvc._loggedInUser['name']);
            }
        });
    },
    getUsersInfo: function(users, callback) {
        this.callMethod('facebook.users.getInfo', ['users='+users.join(','),
                        'fields=name,status,pic,wall_count,notes_count'],
                        function(data) {
            var usersInfo = {};
            for each (var user in data.result_elt) {
                var name   = String(user.name),
                    id     = String(user.@id),
                    status = String(user.status.message),
                    stime  = Number(user.status.time),
                    notes  = Number(user.notes_count),
                    wall   = Number(user.wall_count),
                    pic    = String(decodeURI(user.pic));
                if (!pic) {
                    pic = 'chrome://facebook/content/t_default.jpg';
                } else {
                    pic += '&size=thumb'; 
                }
                if (!status) {
                    stime = 0;
                }
                usersInfo[id] = new facebookUser(id, name, pic, status, stime, notes, wall);
            }
            callback(usersInfo);
        });
    },

    generateSig: function (params) {
        var str = '';
        params.sort();
        for (var i = 0; i < params.length; i++) {
            str += params[i];
        }
        str += this._sessionSecret;
        return MD5(str);
    },
    // Note that this is intended to call non-login related Facebook API
    // functions - ie things other than facebook.auth.*.  The login-related
    // calls are done in the chrome layer.
    // Also note that this is synchronous so you should not call it from the UI.
    callMethod: function (method, params, callback, secondTry) {
        if (!this._loggedIn) return null;

        var origParamsLen = params.length;
        params.push('method=' + method);
        params.push('session_key=' + this._sessionKey);
        params.push('api_key=' + this._apiKey);
        var callId = (new Date()).getTime();
        if (callId <= this._lastCallId) {
            callId = this._lastCallId + 1;
        }
        this._lastCallId = callId;
        params.push('call_id=' + callId);
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
            var listener = {
                onDataAvailable: function(request, context, inputStream, offset, count) {
                    var sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
                    sis.init(inputStream);
                    this.resultTxt += sis.read(count);
                },
                onStartRequest: function(request, context) {
                    debug('starting request', method, callId);
                    this.resultTxt = '';
                    if (fbSvc._pendingRequests.length) {
                        (fbSvc._pendingRequests.shift())();
                    } else {
                        fbSvc._pendingRequest = false;
                    }
                },
                onStopRequest: function(request, context, statusCode) {
                    if (statusCode == Components.results.NS_OK) {
                        this.resultTxt = this.resultTxt.substr(this.resultTxt.indexOf("\n") + 1);
                        if (VERBOSITY == 2) {
                          debug('received text:');
                          dump(this.resultTxt);
                        }
                        var xmldata = new XML(this.resultTxt);
                        if ((String)(xmldata.fb_error.code)) { // need to cast to string or check will never fail
                            if (xmldata.fb_error.code == 102) {
                                debug('session expired, logging out.');
                                fbSvc.sessionEnd();
                            } else if (xmldata.fb_error.code == 4) {
                                // rate limit hit, let's just cancel this request, we'll try again soon enough.
                                debug('RATE LIMIT ERROR');
                            } else {
                                debug('API error:');
                                dump(xmldata.fb_error);
                                if (!secondTry) {
                                    debug('TRYING ONE MORE TIME');
                                    fbSvc.callMethod(method, params.slice(0, origParamsLen), callback, true);
                                }
                            }
                        } else {
                            callback(xmldata);
                        }
                    }
                }
            };
            if (this._pendingRequest) {
                this._pendingRequests.push(function() {
                    channel.asyncOpen(listener, null);
                });
            } else {
                this._pendingRequest = true;
                channel.asyncOpen(listener, null);
            }
        } catch (e) {
            debug('Exception sending REST request: ', e);
            return null;
        }
    },

    showPopup: function(type, pic, label, url) {
        if (!this._prefService.getBoolPref('extensions.facebook.notifications.toggle') ||
            !this._prefService.getBoolPref('extensions.facebook.notifications.' + type)) {
            return;
        }
        debug('showPopup', type, pic, label, url);
        try {
            var alerts = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
            alerts.showAlertNotification(pic, 'Facebook Notification', label, true, url, this._alertObserver);
        } catch(e) {
            try {
                if (!this._prefService.getBoolPref('extensions.facebook.notifications.growl')) {
                    throw null;
                }
                var growlexec = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
                var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);                       
                growlexec.initWithPath(this._prefService.getCharPref('extensions.facebook.notifications.growlpath'));
                if (growlexec.exists()) {
                    process.init(growlexec);
                    var args = ['-n', 'Firefox', '-a', 'Firefox', '-t', 'Facebook Notification', '-m', label];
                    process.run(false, args, args.length);
                }
            } catch (e2) {
                debug('caught', e2);
                this._numAlertsObj.value++;
                var window = this._winService.getMostRecentWindow(null);
                var left = window.screen.width - 220;
                var top = window.screen.height - 25 - 130*this._numAlertsObj.value;
                window.openDialog("chrome://facebook/content/notifier.xul", "_blank",
                                  'chrome=yes,close=yes,dialog=no,left=' + left + ',top=' + top + ',width=210,height=100',
                                  pic, label, url, this._numAlertsObj);
            }
        }
    }
};

// boilerplate stuff
var facebookFactory = {
    createInstance: function (aOuter, aIID) {
        debug('createInstance');
        if (aOuter != null) {
            throw Components.results.NS_ERROR_NO_AGGREGATION;
        }
        return (new facebookService()).QueryInterface (aIID);
    }
};
var facebookModule = {
    registerSelf: function (aCompMgr, aFileSpec, aLocation, aType) {
        debug('registerSelf');
        aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
        aCompMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, CONTRACT_ID, aFileSpec, aLocation, aType);
    },
    unregisterSelf: function(aCompMgr, aLocation, aType) {
        debug('unregisterSelf');
        aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
        aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);        
    },
    getClassObject: function (aCompMgr, aCID, aIID) {
        debug('getClassObject');
        if (!aIID.equals (Ci.nsIFactory))
            throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

        if (aCID.equals (CLASS_ID))
            return facebookFactory;

        throw Components.results.NS_ERROR_NO_INTERFACE;
    },
    canUnload: function(compMgr) {
        debug('canUnload');
        return true;
    }
};
function NSGetModule(compMgr, fileSpec) {
    debug('NSGetModule');
    return facebookModule;
}

function facebookUser(id, name, pic, status, stime, notes, wall) {
    this.id     = id;
    this.name   = name;
    this.pic    = pic;
    this.status = status;
    this.stime  = stime;
    this.notes  = notes;
    this.wall   = wall;
}
facebookUser.prototype = {
    // nsISupports implementation
    QueryInterface: function (iid) {
        if (!iid.equals(Ci.fbIFacebookUser) && 
            !iid.equals(Ci.nsISupports))
            throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    }
};

// just copied from lib.js, lame but i don't feel like including the whole
// file in here for this one function.
function RenderStatusMsg(msg) {
    msg = msg.replace(/\s*$/g, '');
    if (msg && '.?!\'"'.indexOf(msg[msg.length-1]) == -1) {
        msg = msg.concat('.');
    }
    return msg;
}

debug('loaded facebook.js');
