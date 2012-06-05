pref("extensions.facebook.debug", false);

pref("extensions.firefox@facebook.com.name", "chrome://facebook/locale/facebook.properties");
pref("extensions.firefox@facebook.com.description", "chrome://facebook/locale/facebook.properties");

pref("extensions.facebook.notifications.toggle", true);
pref("extensions.facebook.notifications.you.req", true);
pref("extensions.facebook.notifications.you.msg", true);
pref("extensions.facebook.notifications.you.share", true);
pref("extensions.facebook.notifications.you.event.inv", true);
pref("extensions.facebook.notifications.you.group.inv", true);
pref("extensions.facebook.notifications.you.poke", true);
pref("extensions.facebook.notifications.you.friend", true);
pref("extensions.facebook.notifications.you.site", true);
pref("extensions.facebook.notifications.friend.wall", false);
pref("extensions.facebook.notifications.friend.status", true);
pref("extensions.facebook.notifications.friend.note", true);
pref("extensions.facebook.notifications.friend.profile", false);
pref("extensions.facebook.notifications.friend.album", true);
pref("extensions.facebook.notifications.upload.complete", true);
pref("extensions.facebook.notifications.growl", false);
// populated on login
pref("extensions.facebook.uid", "" );
pref("extensions.facebook.access_token", "" );
// What to do after a photo upload:
//  0: ask user
//  1: open album page
//  2: do nothing
pref("extensions.facebook.postuploadaction", 0);
// firstrun prefs
pref("extensions.facebook.first_run_dialog", false);
pref("extensions.facebook.not_first_run", false); // deprecated
pref("extensions.facebook.firstrun", false);

// Like
pref("extensions.facebook.like.enabled", false);

// Toolbar permissions
pref("extensions.facebook.permissions.asked", false);
pref("extensions.facebook.permissions.level", 0); // 0 = not granted, 1+ = permission level depending on version of add-on

// toolbar search type "friendsonly", "graphapi", "extensionservice"
pref("extensions.facebook.toolbar_search_method", "friendsonly");
pref("extensions.facebook.awesomebar_search_method", "extensionservice");
pref("extensions.facebook.awesomebar_search.enabled", true);


