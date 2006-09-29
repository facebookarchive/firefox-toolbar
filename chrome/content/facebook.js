function FacebookRestClient(apiKey, secret, sessionKey) {
    this.apiKey     = apiKey;
    this.secret     = secret;
    this.sessionKey = sessionKey;
}

FacebookRestClient.prototype = {
    generateSig: function (params) {
        var str = '';
        params.sort();
        for (var i = 0; i < params.length; i++) {
            str += params[i];
        }
        str += this.secret;
        return MD5(str);
    },
    callMethod: function (method, params, callback) {
        params.push('method=' + method);
        params.push('session_key=' + this.sessionKey);
        params.push('api_key=' + this.apiKey);
        params.push('call_id=' + (new Date()).getTime());
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
            req.open('POST', 'http://api.dev005.facebook.com:4750/restserver.php', true);
            req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
            req.send(params.join('&'));
        } catch (e) {
            console.log(e);
        }
    },
}
