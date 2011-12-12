const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
 

function AboutFBToolbar() { }

AboutFBToolbar.prototype = {
    
    classDescription: 'about:facebooktoolbar',
    contractID: '@mozilla.org/network/protocol/about;1?what=facebooktoolbar',
    classID: Components.ID('{e0ac3100-952a-46d9-83c0-dbe161a59a69}'),
    
    QueryInterface: XPCOMUtils.generateQI( [Ci.nsIAboutModule] ),
    getURIFlags: function(aURI) {
        return 0;
    },
    newChannel: function(aURI) {
        
        var ios = Cc["@mozilla.org/network/io-service;1"].getService( Ci.nsIIOService );
        var channel = ios.newChannel( 'chrome://facebook/content/about.xul', null, null );
        channel.originalURI = aURI;
        
        return channel;
    }
};

if (XPCOMUtils.generateNSGetFactory)
    const NSGetFactory = XPCOMUtils.generateNSGetFactory( [AboutFBToolbar] );
else
    const NSGetModule = XPCOMUtils.generateNSGetModule( [AboutFBToolbar] );