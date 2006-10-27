function NotifierLoad() {
    document.getElementById('pic').setAttribute('src', window.arguments[0]);
    document.getElementById('label').setAttribute('value', window.arguments[1]);
    document.getElementById('pic').setAttribute('onclick', 'window.open("' + window.arguments[2] + '")');
    document.getElementById('label').setAttribute('onclick', 'window.open("' + window.arguments[2] + '")');
    window.setTimeout('window.close();', 10000);
}
