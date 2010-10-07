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


var _src   = window.arguments[0],
    _label = window.arguments[1],
    _url   = window.arguments[2],
    _count = window.arguments[3];
var _winService = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator),
    _prefService = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);

function NotifierLoad() {
    fbLib.debug('NotifierLoad', _label, _url);
    document.getElementById('pic').setAttribute('src', _src );
    document.getElementById('label').appendChild(document.createTextNode(_label));
    window.setTimeout('window.close();', 10000);
    window.addEventListener('mouseup', NotifierClick, false);
}
function NotifierClick() {
    fbLib.debug('NotifierClick', _label, _url );
    window.close();

    if (_url) { // open
        var win = _winService.getMostRecentWindow( "navigator:browser" );
        var browser = win ? win.getBrowser() : null;
        if( browser
          && 2 != _prefService.getIntPref('browser.link.open_newwindow') )
          // 1 => current Firefox window;
          // 2 => new window;
          // 3 => a new tab in the current window;
        { // open in a focused tab
          var tab = browser.addTab(_url);
          browser.selectedTab = tab;
          win.content.focus();
        }
        else {
          window.open(_url);
        }
    }
}
function NotifierUnload() {
    fbLib.debug('NotifierUnload', _label);
    if( _count )
      _count.value--;
}
// For some reason window.onload doesn't seem to get triggered if we are
// opening mulitple windows at a time.  Need to use DOMContentLoaded instead.
document.addEventListener("DOMContentLoaded", NotifierLoad, false);
window.addEventListener('unload', NotifierUnload, false);
fbLib.debug('loaded notifier.js', window.arguments.length);
