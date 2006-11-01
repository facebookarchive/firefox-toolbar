var loaded=false;
function NotifierLoad() {
    debug('NotifierLoad');
    var w = window;
    document.getElementById('pic').setAttribute('src', w.arguments[0]);
    document.getElementById('label').appendChild(document.createTextNode(w.arguments[1]));
    window.setTimeout('loaded=true', 250);
    window.setTimeout('window.close();', 10000);
    window.addEventListener('focus', NotifierFocus, false);
    window.addEventListener('click', NotifierClick, false);
}
function NotifierFocus(event) {
    // We might get a focus event right away if the window is on top or
    // something, which we want to ignore.  But if we get a focus event after
    // the first 250ms we can assume someone clicked on the notification
    // window and so we can treat it as a click.
    if (loaded) {
        event.stopPropagation();
        event.preventDefault();
        NotifierClick();
    }
}
function NotifierClick() {
    window.close();
    if (window.arguments[2]) {
        window.open(window.arguments[2]);
    }
}
// For some reason window.onload doesn't seem to get triggered if we are
// opening mulitple windows at a time.  Need to use DOMContentLoaded instead.
document.addEventListener("DOMContentLoaded", NotifierLoad, false); 
//window.addEventListener('load', NotifierLoad, false);
debug('loaded notifier.js', window.arguments.length);
