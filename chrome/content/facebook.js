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
    findNamespace: /xmlns=(?:"[^"]*"|'[^']*')/,
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
        params.push('v=1.0');
        params.push('sig=' + this.generateSig(params));
        var req = new XMLHttpRequest();
        var ns_re = this.findNamespace;
        req.onreadystatechange = function (event) {
            if (req.readyState == 4) {
                var status;
                try {
                    status = req.status;
                } catch (e) {
                    status = 0;
                }

                if (status == 200) {
                    dump( 'login:' + req.responseText.indexOf("\n") + "\n" );
                    req.text = req.responseText.substr(req.responseText.indexOf("\n"));
                    var ns = req.text.match(ns_re);
                    if (ns)
                      default xml namespace = ns;
                    req.xmldata = new XML(req.text);
                    callback(req);
                }
            }
        };
        try {
            var restserver = 'https://api.facebook.com/restserver.php';
            req.open('POST', restserver, true);
            req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
            req.send(params.join('&'));
            dump( params.join('&') + "\n" );
        } catch (e) {
            dump('Exception sending REST request: ' + e + '\n');
        }
    }
};

dump('loaded facebook.js\n');
