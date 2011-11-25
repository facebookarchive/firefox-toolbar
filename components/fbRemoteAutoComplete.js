const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');

const CLASS_ID = Components.ID('d9b6cb20-ef5c-11e0-be50-0800200c9a66');
const CLASS_NAME = "Facebook Toolbar Remote AutoComplete";
const CONTRACT_ID = '@mozilla.org/autocomplete/search;1?name=facebook-toolbar-remote-autocomplete';

const NAME_INDEX  = 1;
const URL_INDEX   = 3;
const IMAGE_INDEX = 4;

const MAX_RESULTS = 5;

const FB_SERVER     = "http://www.facebook.com/";
const FB_SEARCH_URL = "search/?q=";
const FB_ENDPOINT   = "search/extension_typeahead.php?max="+MAX_RESULTS+"&q=";

var fbSvc = Cc['@facebook.com/facebook-service;1'].getService(Ci.fbIFacebookService);

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
  _images: [],

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

  clearMatches: function() {
      this._results = [];
      this._comments = null;
      this._images = null;
  },

  appendMatch: function(result, comment, image) {
      this._results.push(result);

      if (!this._comments) this._comments = [];
      this._comments.push(comment);

      if (!this._images) this._images = [];
      this._images.push(image);
  },

  QueryInterface: XPCOMUtils.generateQI([ Ci.nsIAutoCompleteResult ])
};


/**
 * @constructor
 *
 * @implements {nsIAutoCompleteSearch}
 */
function FacebookRemoteAutoCompleteSearch() {
}

FacebookRemoteAutoCompleteSearch.prototype = {

  classID: CLASS_ID,
  classDescription : CLASS_NAME,
  contractID : CONTRACT_ID,

  /**
   * Searches for a given string and notifies a listener (either synchronously
   * or asynchronously) of the result
   *
   * @param searchString the string to search for
   * @param searchParam an extra parameter
   * @param previousResult a previous result to use for faster searchinig
   * @param listener the listener to notify when the search is complete
   */
  startSearch: function(searchString, searchParam, previousResult, listener) {

    var newResult = new FacebookRemoteAutoCompleteResult(searchString, Ci.nsIAutoCompleteResult.RESULT_NOMATCH, 0, "", [], null, null);

    if (!searchString                     ||
        searchString.indexOf('http') == 0 ||
        searchString.indexOf('www')  == 0 ||
        'http'.indexOf(searchString) == 0 ||
        'www'.indexOf(searchString)  == 0 ||
        !fbSvc.loggedIn)
    {
        return listener.onSearchResult(this, newResult);
    }

	oldResult = this._lastResult;

	// If the user has just added a space, just give them the old results
	if (oldResult && oldResult._searchString == searchString.trim()) {
	    oldResult._searchString = searchString;
	    this._lastResult = oldResult;
	    return listener.onSearchResult(this, oldResult);
	}

	this._lastResult = newResult;
	this._last       = searchString;

	var that = this;
	var success = function(data_raw)
    {
	    try {
            var data = JSON.parse(data_raw);
	    } catch(e) {
            return failure();
	    }

	    if (data[0] != that._last)
        {
            return;
	    }
        else
        {
            if (data[NAME_INDEX])
            {
                newResult._searchResult = Ci.nsIAutoCompleteResult.RESULT_SUCCESS;
                newResult.clearMatches();

                for (var i = 0; i < data[NAME_INDEX].length; i++)
                {
                    newResult.appendMatch(
                        data[URL_INDEX][i],
                        data[NAME_INDEX][i],
                        data[IMAGE_INDEX][i]
                        );
                }
            }
	    }

	    listener.onSearchResult(that, newResult);
	};

	var failure = function() {};

	var req = new XMLHttpRequest();
	req.open('GET', FB_SERVER + FB_ENDPOINT + searchString, true);
	req.onreadystatechange = function (aEvt) {
	    if (req.readyState == 4 && req.status == 200) {
		success(req.responseText.substr(9));
	    }
	};
	req.send(null);

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
