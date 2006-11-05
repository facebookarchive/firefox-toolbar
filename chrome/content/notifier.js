function NotifierLoad() {
    debug('NotifierLoad', window.arguments[1]);
    document.getElementById('pic').setAttribute('src', window.arguments[0]);
    document.getElementById('label').appendChild(document.createTextNode(window.arguments[1]));
    window.setTimeout('window.close();', 10000);
    window.addEventListener('mouseup', NotifierClick, false);
}
function NotifierClick() {
    debug('click', window.arguments[1]);
    window.close();
    if (window.arguments[2]) {
        window.open(window.arguments[2]);
    }
}
function NotifierUnload() {
    debug('unload', window.arguments[1]);
    window.arguments[3].value--;
}
// For some reason window.onload doesn't seem to get triggered if we are
// opening mulitple windows at a time.  Need to use DOMContentLoaded instead.
document.addEventListener("DOMContentLoaded", NotifierLoad, false); 
window.addEventListener('unload', NotifierUnload, false);
debug('loaded notifier.js', window.arguments.length);
