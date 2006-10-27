// Note that this file is intended for login-related API function calls only
// (ie facebook.auth.*).  Other API calls go through the Facebook xpcom service.
var Cc = Components.classes;
var Ci = Components.interfaces;

// Load MD5 code...
Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript('chrome://facebook/content/md5.js');

function FacebookLoginClient() {
    this.fbSvc = Cc['@facebook.com/facebook-service;1'].getService().QueryInterface(Ci.fbIFacebookService);
}

FacebookLoginClient.prototype = {
    generateSig: function (params) {
        var str = '';
        params.sort();
        for (var i = 0; i < params.length; i++) {
            str += params[i];
        }
        str += this.fbSvc.secret;
        return MD5(str);
    },
    callMethod: function (method, params, callback) {
        params.push('method=' + method);
        params.push('api_key=' + this.fbSvc.apiKey);
        params.push('sig=' + this.generateSig(params));

        var req = new XMLHttpRequest();
        req.onreadystatechange = function (event) {
            if (req.readyState == 4) {
                var status;
                try {
                    status = req.status;
                } catch (e) {
                    status = 0;
                }

                if (status == 200) {
                    req.text = req.responseText.substr(req.responseText.indexOf("\n"));
                    req.xmldata = new XML(req.text);
                    callback(req);
                }
            }
        };
        try {
            req.open('POST', 'https://api.facebook.com/restserver.php', true);
            req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
            req.send(params.join('&'));
        } catch (e) {
            dump('Exception sending REST request: ' + e + '\n');
        }
    },
};

dump('loaded facebook.js\n');
