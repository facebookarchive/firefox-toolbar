const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');

const CLASS_ID = Components.ID('d9b6cb20-ef5c-11e0-be50-0800200c9a66');
const CLASS_NAME = "Facebook Toolbar Remote AutoComplete";
const CONTRACT_ID = '@mozilla.org/autocomplete/search;1?name=facebook-toolbar-remote-autocomplete';

const FB_UID_PREF = "extensions.facebook.uid";
const FB_ENABLED_PREF = "extensions.facebook.awesomebar_search.enabled";
const FB_BOOTSTRAP_ENDPOINT = "https://www.facebook.com/ajax/typeahead/search/bootstrap.php";
const FB_QUERY_ENDPOINT = "https://www.facebook.com/ajax/typeahead/search.php";

var aConsoleService = Components.classes["@mozilla.org/consoleservice;1"].
     getService(Components.interfaces.nsIConsoleService);

var debug = function(msg)
{
/*
  dump("fbRemoteAutoComplete: " + msg + "\n");
  aConsoleService.logStringMessage("fbRemoteAutoComplete: " + msg);
*/
}

function XMLHttpRequest()
{
  var request = Components.
                classes["@mozilla.org/xmlextras/xmlhttprequest;1"].
      createInstance();

  // QI the object to nsIDOMEventTarget to set event handlers on it:
  request.QueryInterface(Components.interfaces.nsIDOMEventTarget);

  // QI it to nsIXMLHttpRequest
  request.QueryInterface(Components.interfaces.nsIXMLHttpRequest);

  return request;
}

Components.utils.import("resource://gre/modules/Services.jsm");

/**
 * @constructor
 *
 * @implements {nsIAutoCompleteResult}
 *
 * @param {string} searchString
 * @param {number} searchResult
 * @param {number} defaultIndex
 * @param {string} errorDescription
 * @param {Array.<string>} results
 * @param {Array.<string>|null=} comments
 */
function FacebookRemoteAutoCompleteResult(searchString, searchResult,
  defaultIndex, errorDescription, results, comments, images) {
  this._searchString = searchString;
  this._searchResult = searchResult;
  this._defaultIndex = defaultIndex;
  this._errorDescription = errorDescription;
  this._results = results;
  this._comments = comments;
  this._images = images;
}

FacebookRemoteAutoCompleteResult.prototype = {
  _searchString: "",
  _searchResult: 0,
  _defaultIndex: 0,
  _errorDescription: "",
  _results: [],
  _comments: [],

  /**
   * @return {string} the original search string
   */
  get searchString() {
    return this._searchString;
  },

  /**
   * @return {number} the result code of this result object, either:
   *   RESULT_IGNORED   (invalid searchString)
   *   RESULT_FAILURE   (failure)
   *   RESULT_NOMATCH   (no matches found)
   *   RESULT_SUCCESS   (matches found)
   */
  get searchResult() {
    return this._searchResult;
  },

  /**
   * @return {number} the index of the default item that should be entered if
   *   none is selected
   */
  get defaultIndex() {
    return this._defaultIndex;
  },

  /**
   * @return {string} description of the cause of a search failure
   */
  get errorDescription() {
    return this._errorDescription;
  },

  /**
   * @return {number} the number of matches
   */
  get matchCount() {
    return this._results.length;
  },

  /**
   * @return {string} the value of the result at the given index
   */
  getValueAt: function(index) {
    return this._results[index];
  },

  /**
   * @return {string} the comment of the result at the given index
   */
  getCommentAt: function(index) {
    if (this._comments)
      return this._comments[index];
    else
      return '';
  },

  /**
   * @return {string} the style hint for the result at the given index
   */
  getStyleAt: function(index) {
    if (!this._comments || !this._comments[index])
      return null;  // not a category label, so no special styling

    if (index == 0)
      return 'suggestfirst';  // category label on first line of results

    return 'suggesthint';   // category label on any other line of results
  },

  /**
   * Gets the image for the result at the given index
   *
   * @return {string} the URI to the image to display
   */
  getImageAt : function (index) {
    if (this._images)
      return this._images[index];
    else
      return '';
  },

  /**
   * Removes the value at the given index from the autocomplete results.
   * If removeFromDb is set to true, the value should be removed from
   * persistent storage as well.
   */
  removeValueAt: function(index, removeFromDb) {
    this._results.splice(index, 1);

    if (this._comments)
      this._comments.splice(index, 1);
  },

  getLabelAt: function(index) { return this._results[index]; },

  appendMatch: function(result, comment, image) {
      this._results.push(result);

      if (!this._comments) this._comments = [];
      this._comments.push(comment);

      if (!this._images) this._images = [];
      this._images.push(image);
  },

  QueryInterface: XPCOMUtils.generateQI([ Ci.nsIAutoCompleteResult ])
};

var myObserver = function(fbca)
{  
    this.register(fbca);  
}

myObserver.prototype = {  
  observe: function(subject, topic, data) {  
     this.fbca.bootstrap();
  },  
  register: function(fbca) {  
      this.fbca = fbca;
    var observerService = Components.classes["@mozilla.org/observer-service;1"]  
                          .getService(Components.interfaces.nsIObserverService);  
    observerService.addObserver(this, 'facebook-session-start-oauth', false);
    observerService.addObserver(this, 'facebook-session-end', false);
  },  
  unregister: function() {  
    var observerService = Components.classes["@mozilla.org/observer-service;1"]  
                            .getService(Components.interfaces.nsIObserverService);  
    observerService.removeObserver(this, 'facebook-session-start-oauth');
    observerService.removeObserver(this, 'facebook-session-end');
  }  
}  


var prefsObserver = function(fbca)
{  
    this.register(fbca);  
}

prefsObserver.prototype = {  
  observe: function(subject, topic, data) {  
      this.fbca.init();
  },  
  register: function(fbca) {  
      this.fbca = fbca;
      Services.prefs.addObserver(FB_ENABLED_PREF, this, false);
  },  
  unregister: function() {  
      Services.prefs.removeObserver(FB_ENABLED_PREF, this);
  }  
}  

/**
 * @constructor
 *
 * @implements {nsIAutoCompleteSearch}
 */
function FacebookRemoteAutoCompleteSearch()
{
    this.init();
}

FacebookRemoteAutoCompleteSearch.prototype = {

  classID: CLASS_ID,
  classDescription : CLASS_NAME,
  contractID : CONTRACT_ID,

  resultCache: {},
  queryCache: {},
  bootstrapped: false,
  enabled: false,
  observer: null,
  prefsObserver: null,

  get uid() {
    return Services.prefs.getCharPref(FB_UID_PREF);
  },

  init: function()
  {
    debug('init');
    this.enabled = false;

    try
    {
        this.observer = new myObserver(this);  
        this.prefsObserver = new prefsObserver(this);  
    } catch (e)
    {
        debug("Error registering observer: " + e);
    }

    if (!Services.prefs.getBoolPref(FB_ENABLED_PREF))
        return;

    this.bootstrap();
    this.enabled = true;
    debug('done init');
  },

  bootstrap: function()
  {
      debug('bootstrapping');

      this.sid = Math.random();
      this.resultCache = {};
      this.bootstrapped = false;

      if (!this.fbSvc)
        this.fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);

      if (!this.uid || this.uid == "" || !this.fbSvc.loggedIn)
      {
          debug('no user id');
          //this.fbSvc.sessionEnd();
          return;
      }

      var opts = [
        //{filter: ['event'], no_cache: 1},
        //{filter: ['user']},
        //{filter: ['user'], no_cache: 1, options: ['lean']},
        {filter: ['app', 'page', 'group', 'friendlist', 'event', 'user'], no_cache: 1}
        ];

      var self = this;

      var dispatch = function(q)
      {
          var req = new XMLHttpRequest();

          req.open('GET', q, true);
          req.onreadystatechange = function (aEvt)
          {
              if (req.readyState == 4)
              {
                  if (req.status == 200)
                  {
                      var res = self.parsePayload(req.responseText.substr(9));

                      if (res)
                      {
                          for (var id in res)
                          {
                              self.resultCache[id] = res[id];
                          }

                          self.bootstrapped = true;
                      }
                  }
              }
          };
          req.send(null);
      }

      for (var i=0; i<opts.length; i++)
      {
          var q = FB_BOOTSTRAP_ENDPOINT + "?";
          for (var opt in opts[i])
          {
              if (opts[i][opt] instanceof Array)
              {
                  for (var j=0; j<opts[i][opt].length; j++)
                  {
                      q  += opt + "[" + j + "]=" + opts[i][opt][j] + "&";
                  }
              }
              else
              {
                  q += opt + "=" + opts[i][opt] + "&";
              }
          }
          q += "__a=1&__user="+self.uid+"&viewer="+self.uid+"&token=v7";

          dispatch(q);
      }
  },

  query: function(searchString, cachedResults, listener)
  {
      var self = this;

      if (self.queryRequest)
      {
          try {
              self.queryRequest.abort();
          } catch (e) {}
      }

      self.queryRequest = new XMLHttpRequest();

      var opts = {
          __a: "1",
          value: encodeURI(searchString),
          viewer: this.uid,
          rsp: "search",
          context: "search",
          sid: this.sid,
          existing_ids: "",
          __user: this.uid
      };

      var q = FB_QUERY_ENDPOINT + "?";

      for (var opt in opts)
      {
          q += opt + "=" + opts[opt] + "&";
      }

      self.queryRequest.open('GET', q, true);
      self.queryRequest.onreadystatechange = function (aEvt)
      {
          if (self.queryRequest.readyState == 4)
          {
              if (self.queryRequest.status == 200)
              {
                  var queryResults = self.parsePayload(self.queryRequest.responseText.substr(9));

                  debug("XX finished ajax query for '" + searchString + "'");

                  if (queryResults)
                  {
                      debug("XX adding " + cachedResults.matchCount + " cached results to query results");

                      if (cachedResults && cachedResults.matchCount > 0)
                      {
                          newResult = cachedResults;
                      }
                      else
                      {
                          newResult = new FacebookRemoteAutoCompleteResult(searchString, Ci.nsIAutoCompleteResult.RESULT_SUCCESS, 0, "", [], null, null);
                      }

                      //queryResults = queryResults.sort(function(a, b) { return a.index - b.index; });

                      for (var id in queryResults)
                      {
                          var existing = false;

                          for (var j=0; j<cachedResults.matchCount; j++) 
                          {
                              if (cachedResults.getValueAt(j) == queryResults[id].path)
                              {
                                  existing = true;
                                  break;
                              }
                          }

                          if (existing)
                          {
                              //self.resultCache[queryResults[i].uid].query = searchString.toLowerCase();
                              continue;
                          }
                          else
                          {
                              debug("XX have a query result '" +  queryResults[id].text + "'");
                              newResult.appendMatch(
                                      queryResults[id].path,
                                      queryResults[id].text,
                                      queryResults[id].photo);
                              //queryResults[i].query = searchString.toLowerCase();
                              //self.resultCache[queryResults[i].uid] = queryResults[i];
                          }

                      }

                      self.queryCache[searchString.toLowerCase()] = queryResults;

                      //self._lastResult = newResult;
                      listener.onSearchResult(self, newResult);
                  }
              }
          }
      };
      self.queryRequest.send(null);

  },

  parsePayload: function(pltext)
  {
      //debug("XX Payload: " + pltext);

      var queryResults = {};

      try
      {
          var pl = JSON.parse(pltext);

          if (pl.error)
          {
              if (pl.error == 1357001)
              {
                  this.fbSvc.sessionEnd();
              }

              debug("Error in payload: " + pl.error);
              return null;
          }

          if (!pl.payload || !pl.payload.entries)
          {
              debug("Payload is missing entries");
              return null;
          }

          for (var i=0; i<pl.payload.entries.length; i++)
          {
              var entry = pl.payload.entries[i];

              if (!entry.uid)
              {
                  debug("XX entry is missing uid");
                  continue;
              }

              /*if (this.resultCache[entry.uid])
              {
                  debug("XX hit cache on " + entry.uid);
                  continue;
              }*/

              var path = (entry.path.toString().substring(0,1) == "/"?
                "https://www.facebook.com" + entry.path.toString():
                entry.path.toString());

              var result = {
                  uid: entry.uid,
                  type: entry.type.toString(),
                  path: path,
                  text: entry.text.toString(),
                  _text_lc: entry.text.toLowerCase(),
                  photo: entry.photo.toString(),
                  //category: (entry.category?entry.category.toString():""),
                  tokens: (entry.tokens?entry.tokens.toString().split(" "):null),
                  alias: entry.alias,
                  index: entry.index
              };

              //this.resultCache[entry.uid] = result;
              //queryResults.push(result);
              queryResults[entry.uid] = result;
          }
      }
      catch (e)
      {
          debug("Error parsing payload: " + e);
          return null;
      }

      return queryResults;
  },

  searchResultCache: function(searchString)
  {
      var tmpResults = [];
      var search_lc = searchString.toLowerCase();
      var newResult = new FacebookRemoteAutoCompleteResult(searchString, Ci.nsIAutoCompleteResult.RESULT_SUCCESS, 0, "", [], null, null);

      function searchACache(q, c)
      {
          var r = [];

          for (var id in c)
          {
              if (c[id]._text_lc.indexOf(q) > -1
                  || (c[id].alias && c[id].alias.indexOf(q) > -1)
                  )
              {
                  r.push(c[id]);
                  //debug("XX searchString '" + q + "' found in cache");
              }
              else if (c[id].tokens)
              {
                  for (var i=0; i<c[id].tokens.length; i++)
                  {
                      if (c[id].tokens[i].indexOf(q) > -1)
                      {
                          r.push(c[id]);
                          //debug("XX searchString '" + q + "' found in cache");
                          break;
                      }
                  }
              }
          }

          return r;
      }

      var tmpResults = searchACache(search_lc, this.resultCache);
      tmpResults = tmpResults.sort(function(a, b) { return a.index - b.index; });

      debug("XX have " + tmpResults.length + " results from bootstrap cache ");

      if (this.queryCache[search_lc])
      {
          debug("XX found cached query for '" + search_lc + "'");
          newResult.hitQueryCache = true;

          //tmpResults = tmpResults.concat(searchACache(search_lc, this.queryCache[search_lc]));
          for (var id in this.queryCache[search_lc])
          {
              var existing = false;

              for (var i=0; i<tmpResults.length; i++)
              {
                  if (tmpResults[i].uid == id)
                  {
                      existing = true;
                      break;
                  }
              }

              if (!existing)
                  tmpResults.push(this.queryCache[search_lc][id]);
          }

          debug("XX have " + tmpResults.length + " results from bootstrap cache matches + query cache matches");
      }

      if (tmpResults.length > 0)
      {
          for (var i=0; i<tmpResults.length; i++)
          {
              newResult.appendMatch(
                      tmpResults[i].path,
                      tmpResults[i].text,
                      tmpResults[i].photo);
          }
      }

      return newResult;
  },

  /**
   * Searches for a given string and notifies a listener (either synchronously
   * or asynchronously) of the result
   *
   * @param searchString the string to search for
   * @param searchParam an extra parameter
   * @param previousResult a previous result to use for faster searchinig
   * @param listener the listener to notify when the search is complete
   */
  startSearch: function(searchString, searchParam, previousResult, listener)
  {
    if (!this.enabled)
        return null;

    var self = this;
    var newResult = new FacebookRemoteAutoCompleteResult(searchString, Ci.nsIAutoCompleteResult.RESULT_NOMATCH, 0, "", [], null, null);

    debug("in startSearch with '" + searchString + "'");

    if (!this.fbSvc.loggedIn)
    {
        newResult._searchResult = Ci.nsIAutoCompleteResult.RESULT_IGNORED;
        return listener.onSearchResult(this, newResult);
    }

    if (!this.bootstrapped)
    {
        this.bootstrap();
        newResult._searchResult = Ci.nsIAutoCompleteResult.RESULT_IGNORED;
        return listener.onSearchResult(this, newResult);
    }

    if (!searchString ||
        searchString.indexOf('http') == 0 ||
        searchString.indexOf('www')  == 0 ||
        'http'.indexOf(searchString) == 0 ||
        'www'.indexOf(searchString)  == 0)
    {
        newResult._searchResult = Ci.nsIAutoCompleteResult.RESULT_IGNORED;
        return listener.onSearchResult(this, newResult);
    }

	//oldResult = this._lastResult;

	// If the user has just added a space, just give them the old results
    /*
	if (oldResult && oldResult._searchString == searchString.trim())
    {
	    oldResult._searchString = searchString;
	    this._lastResult = oldResult;
	    return listener.onSearchResult(this, oldResult);
	}
    */

	//this._lastResult = newResult;
	//this._last       = searchString;

    var res = this.searchResultCache(searchString);

    if (self.queryTimeout)
    {
        try
        {
            self.queryTimeout.cancel();
        } catch(e) {}

        self.queryTimeout = null;
    }

    if (res.matchCount > 5 || res.hitQueryCache)
    {
        //this._lastResult = res;
        debug("results found in cache = " + res.matchCount + " , will show results now");

        var event = {
            notify: function(timer) {
                listener.onSearchResult(self, res);
            }
        };

        self.queryTimeout = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);  
        self.queryTimeout.initWithCallback(event, 500, Components.interfaces.nsITimer.TYPE_ONE_SHOT); 
    }
    else
    {
        debug("results found in cache = " + res.matchCount + " , will fetch more results");

        var event = {
            notify: function(timer) {
                self.query(searchString, res, listener);
            }
        };

        self.queryTimeout = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);  
        self.queryTimeout.initWithCallback(event, 500, Components.interfaces.nsITimer.TYPE_ONE_SHOT); 
    }
  },

  /**
   * Stops an asynchronous search that is in progress
   */
  stopSearch: function() {
  },

  QueryInterface: XPCOMUtils.generateQI([ Ci.nsIAutoCompleteSearch ])
};

// The following line is what XPCOM uses to create components
if (XPCOMUtils.generateNSGetFactory)
    const NSGetFactory = XPCOMUtils.generateNSGetFactory( [FacebookRemoteAutoCompleteSearch] );
else
    const NSGetModule = XPCOMUtils.generateNSGetModule( [FacebookRemoteAutoCompleteSearch] );
