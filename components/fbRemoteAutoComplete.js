const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');

const CLASS_ID = Components.ID('d9b6cb20-ef5c-11e0-be50-0800200c9a66');
const CLASS_NAME = "Facebook Toolbar Remote AutoComplete";
const CONTRACT_ID = '@mozilla.org/autocomplete/search;1?name=facebook-toolbar-remote-autocomplete';

const FB_UID_PREF = "extensions.facebook.uid";
const FB_BOOTSTRAP_ENDPOINT = "https://www.facebook.com/ajax/typeahead/search/bootstrap.php";
const FB_QUERY_ENDPOINT = "https://www.facebook.com/ajax/typeahead/search.php";

var debug = function(msg)
{
  dump("fbRemoteAutoComplete: " + msg + "\n");
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

  get uid() {
    return Services.prefs.getCharPref(FB_UID_PREF);
  },

  init: function()
  {
    debug('init');
    try
    {
    observer = new myObserver(this);  
    } catch (e)
    {
        debug("Error registering observer: " + e);
    }
    this.bootstrap();
    debug('done init');
  },

  bootstrap: function()
  {
      this.sid = Math.random();
      this.resultCache = {};
      this.bootstrapped = false;

      if (!this.fbSvc)
        this.fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);

      if (!this.uid || this.uid == "" || !this.fbSvc.loggedIn)
          return;

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
                          for (var i=0; i<res.length; i++)
                          {
                              self.resultCache[res[i].uid] = res[i];
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

                  if (queryResults)
                  {
                      if (cachedResults && cachedResults.matchCount > 0)
                      {
                          newResult = cachedResults;
                      }
                      else
                      {
                          newResult = new FacebookRemoteAutoCompleteResult(searchString, Ci.nsIAutoCompleteResult.RESULT_SUCCESS, 0, "", [], null, null);
                      }

                      for (var i=0; i<cachedResults.length; i++)
                      {
                          newResult.appendMatch(
                                  cachedResults[i].path,
                                  cachedResults[i].text,
                                  cachedResults[i].photo);
                      }

                      queryResults = queryResults.sort(function(a, b) { return a.index - b.index; });

                      for (var i=0; i<queryResults.length; i++)
                      {
                          newResult.appendMatch(
                                  queryResults[i].path,
                                  queryResults[i].text,
                                  queryResults[i].photo);
                      }

                      self._lastResult = newResult;
                      listener.onSearchResult(self, newResult);

                      self.queryCache[searchString.toLowerCase()] = queryResults;
                  }
              }
          }
      };
      self.queryRequest.send(null);

  },

  parsePayload: function(pltext)
  {
      //debug("XX Payload: " + pltext);
      var queryResults = [];

      try
      {
          var pl = JSON.parse(pltext);

          if (pl.error)
          {
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

              if (this.resultCache[entry.uid])
              {
                  debug("XX hit cache on " + entry.uid);
                  continue;
              }

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
                  tokens: (entry.tokens?entry.tokens.split(" "):null),
                  alias: entry.alias,
                  index: entry.index
              };

              //this.resultCache[entry.uid] = result;
              queryResults.push(result);
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

      for (var id in this.resultCache)
      {
          if (this.resultCache[id]._text_lc.indexOf(search_lc) > -1
              || (this.resultCache[id].alias && this.resultCache[id].alias.indexOf(search_lc) > -1)
              )
          {
              tmpResults.push(this.resultCache[id]);
          }
          else if (this.resultCache[id].tokens)
          {
              for (var i=0; i<this.resultCache[id].tokens.length; i++)
              {
                  if (this.resultCache[id].tokens[i].indexOf(search_lc) > -1)
                  {
                      tmpResults.push(this.resultCache[id]);
                      break;
                  }
              }
          }
      }

      var foundCachedSearchString = "";

      for (var cachedSearchString in this.queryCache)
      {
          if (cachedSearchString.indexOf(search_lc) > -1 && cachedSearchString.length > foundCachedSearchString.length)
          {
              foundCachedSearchString = cachedSearchString;
          }
      }

      if (foundCachedSearchString != "")
      {
          var foundQueryCache = this.queryCache[foundCachedSearchString];

          tmpResults = tmpResults.concat(foundQueryCache);
      }

      var newResult = new FacebookRemoteAutoCompleteResult(searchString, Ci.nsIAutoCompleteResult.RESULT_SUCCESS, 0, "", [], null, null);

      if (tmpResults.length > 0)
      {
          tmpResults = tmpResults.sort(function(a, b) { return a.index - b.index; });
          for (var i=0; i<tmpResults.length; i++)
          {
              newResult.appendMatch(
                      tmpResults[i].path,
                      tmpResults[i].text,
                      tmpResults[i].photo);
          }
      }

      if (foundCachedSearchString != "")
          newResult.hitQueryCache = true;

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
    var self = this;
    var newResult = new FacebookRemoteAutoCompleteResult(searchString, Ci.nsIAutoCompleteResult.RESULT_NOMATCH, 0, "", [], null, null);

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

	oldResult = this._lastResult;

	// If the user has just added a space, just give them the old results
	if (oldResult && oldResult._searchString == searchString.trim())
    {
	    oldResult._searchString = searchString;
	    this._lastResult = oldResult;
	    return listener.onSearchResult(this, oldResult);
	}

	this._lastResult = newResult;
	this._last       = searchString;

    var res = this.searchResultCache(searchString);

    if (res.matchCount > 5 || res.hitQueryCache)
    {
        this._lastResult = res;
        return listener.onSearchResult(this, res);
    }
    else
    {
        if (self.queryTimeout)
        {
            try
            {
                self.queryTimeout.cancel();
            } catch(e) {}

            self.queryTimeout = null;
        }

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
