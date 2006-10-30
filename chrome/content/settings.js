var Cc = Components.classes;
var Ci = Components.interfaces;

var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);

// this works for loading or saving, strangely enough...
function TouchSettings(save) {
  var checkboxes = document.getElementsByTagName('checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    var node = checkboxes[i];
    var pref = 'extensions.' + node.id.replace(/-/g, '.');
    if (save) {
      prefSvc.setBoolPref(pref, node.checked);
    } else {
      node.checked = prefSvc.getBoolPref(pref);
    }
  }
  var textboxes = document.getElementsByTagName('textbox');
  for (var i = 0; i < textboxes.length; i++) {
    var node = textboxes[i];
    var pref = 'extensions.' + node.id.replace(/-/g, '.');
    if (save) {
      prefSvc.setCharPref(pref, node.value);
    } else {
      node.value = prefSvc.getCharPref(pref);
    }
  }
  if (!save && navigator.platform.indexOf('Mac') == -1) {
    document.getElementById('facebook-growlbox').style.display = 'none';
  }
}
