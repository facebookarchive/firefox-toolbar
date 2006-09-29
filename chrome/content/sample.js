client = new FacebookRestClient('64f19267b0e6177ea503046d801c00df', 'a8a5a57a9f9cd57473797c4612418908', '')
var auth_token = '';
client.callMethod('facebook.auth.createToken', [], function(req) {
    console.log('hello');
    console.log('req.responseText');
    console.log(req.xmldata);
    auth_token = req.xmldata.token;
});

function FacebookLogin() {
    if (auth_token) {
        window.location = 'http://api.dev005.facebook.com:4750/login.php?api_key=' + client.apiKey +
                          '&auth_token=' + auth_token;
    }
}
