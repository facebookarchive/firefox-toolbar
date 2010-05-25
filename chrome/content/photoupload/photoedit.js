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

// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const CC = Components.Constructor;
const Cu = Components.utils;

// All photos are removed. No parameter.
const CHANGE_REMOVE_ALL = "removeAll";
// A photo is removed. Parameter is the removed photo.
const CHANGE_REMOVE = "remove";
// A photo is added. Parameter is the added photo.
const CHANGE_ADD = "add";
// A photo is updated. Parameter is the updated photo
const CHANGE_UPDATE = "update";
// The selected photo changes. Parameter is the new selected photo.
const CHANGE_SELECTED = "selected";

const DEBUG = true;

// Debugging.
function LOG(s) {
  if (DEBUG)
    dump(s + "\n");
}

// JavaScript semantics is required for some member access, that's why
// we use wrappedJSObject instead of going throught the .idl.
var gFacebookService =  Cc['@facebook.com/facebook-service;1'].
                        getService(Ci.fbIFacebookService).
                        wrappedJSObject;
// Unwrapped version.
var gFacebookServiceUnwrapped =  Cc['@facebook.com/facebook-service;1'].
                                 getService(Ci.fbIFacebookService);



PhotoUpload = window.arguments[1];
PhotoSet = window.arguments[2];

/**
 * Base class for representing a photo tag.
 */
function Tag(label, x, y) {
  this.label = label;
  this.x = x;
  this.y = y;
}
Tag.prototype = {
  getUploadObject: function() {
    var uploadObject = {
      x: this.x,
      y: this.y
    };
    var [key, value] = this.getUploadObjectKeyValue();
    uploadObject[key] = value;
    return uploadObject;
  }
}

/**
 * Class for text based tags.
 */
function TextTag(text, x, y) {
  Tag.call(this, text, x, y);
  this.text = text;
}
TextTag.prototype = {
  __proto__: Tag.prototype,
  getUploadObjectKeyValue: function() {
    return ["tag_text", this.text];
  },
  toString: function() {
    return "<TextTag " + this.text + ">";
  }
}

/**
 * Object that represents a friend.
 */
function Friend(name, uid) {
  this.name = name;
  this.uid = uid;
}
Friend.prototype = {
  toString: function() {
    return "<Friend name: '" + this.name + "' uid: " + this.uid + ">";
  }
};

/**
 * Class for people based tags.
 */
function PeopleTag(friend, x, y) {
  Tag.call(this, friend.name, x, y);
  this.friend = friend;
}
PeopleTag.prototype = {
  __proto__: Tag.prototype,
  getUploadObjectKeyValue: function() {
    return ["tag_uid", this.friend.uid];
  },
  toString: function() {
    return "<PeopleTag " + this.friend + ">";
  }
}

/**
 * The panel that shows the selected photo where attributes can be edited.
 */
var EditPanel = {
  _editImageFrame: null,
  _imageElement: null,
  _highlightDiv: null,
  _highlightDivInside: null,
  _imageWidth: null,
  // Keep this in sync with the css in editimage.html
  IMAGE_BORDER_SIZE: 1,

  init: function() {
    //PhotoSet.addChangedListener(this.photosChanged, EditPanel);
    this._editImageFrame = document.getElementById("editImageFrame");
    this._imageElement = this._editImageFrame.contentDocument
                             .getElementById("image");
    var self = this;
    this._imageElement.addEventListener("load", function(event) {
      self._onImageLoaded(event);
    }, false);
    this._highlightDiv = this._editImageFrame.contentDocument
                             .getElementById("tagHighlight");
    this._highlightDivInside = this._editImageFrame.contentDocument
                                   .getElementById("tagHighlightInside");

    this.photosChanged(CHANGE_UPDATE, window.arguments[0]);
  },

  uninit: function() {
    PhotoSet.removeChangedListener(this.photosChanged, EditPanel);
  },

  _onImageLoaded: function(event) {
    this._imageWidth = event.target.width;
  },

  photosChanged: function(changeType, parameter) {
    LOG("EditPanel::PhotosChanged " + changeType);

    // Only care about update and selection change. If a photo is removed, we'll
    // always be notified of a selection change.
    if (changeType != CHANGE_UPDATE && changeType != CHANGE_SELECTED)
      return;

    var selectedPhoto = parameter;

    var filenameField = document.getElementById("editFilenameField");
    var sizeField = document.getElementById("editSizeField");
    var captionField = document.getElementById("editCaptionField");
    var tagList = document.getElementById("editTagList");
    var tagHelpBox = document.getElementById("editTagHelpBox");
    var removeTagsButton = document.getElementById("editRemoveTagsButton");

    this._imageElement.removeAttribute("hidden");
    this._hideTagHighlight();
    captionField.disabled = false;
    tagHelpBox.collapsed = false;
    removeTagsButton.disabled = true;
    while (tagList.hasChildNodes())
      tagList.removeChild(tagList.firstChild);

    if (!selectedPhoto) {
      this._imageWidth = null;
      this._imageElement.setAttribute("hidden", "true");
      this._imageElement.setAttribute("src", "about:blank");
      filenameField.value = "";
      sizeField.value = "";
      captionField.value = "";
      captionField.disabled = true;
      return;
    }

    this._imageElement.setAttribute("src", selectedPhoto.url);
    var filename = selectedPhoto.filename;
    const MAX_FILENAME_SIZE = 30;
    if (filename.length > MAX_FILENAME_SIZE)
      filename = filename.substring(0, MAX_FILENAME_SIZE) + "...";
    filenameField.value = filename;
    var sizeKb = selectedPhoto.sizeInBytes / 1024;
    var sizeString = PhotoUpload._stringBundle.getFormattedString("sizekb", [sizeKb.toFixed(0)])
    sizeField.value = sizeString;
    captionField.value = selectedPhoto.caption;

    if (selectedPhoto.tags.length == 0)
      return;

    tagHelpBox.collapsed = true;

    for each (let tag in selectedPhoto.tags) {
      var item = document.createElement("listitem");
      item.setAttribute("label", tag.label);
      item.tag = tag;
      tagList.appendChild(item);
    }
  },

  _showTagHighlight: function(tag) {
    var divX = this._imageElement.offsetLeft + this.IMAGE_BORDER_SIZE +
                   (tag.x * this._imageElement.clientWidth / 100);
    var divY = this._imageElement.offsetTop + this.IMAGE_BORDER_SIZE +
                   (tag.y * this._imageElement.clientHeight / 100);

    this._highlightDiv.style.left = divX + "px";
    this._highlightDiv.style.top = divY + "px";
    this._highlightDiv.removeAttribute("hidden");

    // The tag highlight box is 166x166 pixel large in the photo.php Facebook
    // page (the page users see when browsing photos).
    // The photo in the edit panel could be smaller than the photo in photo.php.
    // To make things more convenient, the tag highlight box is made
    // proportional to the highlight box size that would appear in photo.php.

    var highlightSize = [166, 166];
    if (this._imageWidth) {
      var ratio = this._imageWidth / PhotoSet.selected.facebookSize[0];
      highlightSize[0] *= ratio;
      highlightSize[1] *= ratio;
    }
    // This is the sum of the tagHighlight div border and tagHighlightInside border
    // Keep this in sync with the css of editimage.html.
    // TODO: use getComputedStyle to make this dynamic.
    const HIGHLIGHT_DIV_OFFSET_BASE = 9;

    var offsetLeft = HIGHLIGHT_DIV_OFFSET_BASE + highlightSize[0] / 2
    var offsetTop = HIGHLIGHT_DIV_OFFSET_BASE + highlightSize[1] / 2;

    this._highlightDiv.style.marginLeft = "-" + offsetLeft.toFixed(0) + "px";
    this._highlightDiv.style.marginTop = "-" + offsetTop.toFixed(0) + "px";

    this._highlightDivInside.style.width = highlightSize[0] + "px";
    this._highlightDivInside.style.height = highlightSize[1] + "px";
  },

  _hideTagHighlight: function() {
    this._highlightDiv.setAttribute("hidden", "true");
  },

  _updateRemoveTagsButton: function() {
    var tagList = document.getElementById("editTagList");
    var removeTagsButton = document.getElementById("editRemoveTagsButton");
    removeTagsButton.disabled = !tagList.selectedCount;
  },

  onTagSelect: function(event) {
    var tagList = event.target;
    this._updateRemoveTagsButton();
  },

  onMouseOver: function(event) {
    if (event.target.nodeName != "listitem")
      return;
    var tag = event.target.tag;
    if (!tag)
      return;
    this._showTagHighlight(tag);
  },

  onMouseOut: function(event) {
    this._hideTagHighlight();
  },

  onRemoveSelectedTags: function(event) {
    var tagList = document.getElementById("editTagList");
    var selectedPhoto = PhotoSet.selected;
    if (tagList.selectedCount == 0 || !selectedPhoto)
      return;

    for each (let item in tagList.selectedItems) {
      var tag = item.tag;
      selectedPhoto.removeTag(tag);
    }
    PhotoSet.update(selectedPhoto);

    this._updateRemoveTagsButton();
  },

  onCaptionInput: function(event) {
    var selectedPhoto = PhotoSet.selected;
    if (!selectedPhoto)
      return;

    selectedPhoto.caption = event.target.value;
    PhotoSet.update(selectedPhoto);
  },

  onPhotoClick: function(event) {
    var selectedPhoto = PhotoSet.selected;
    if (!selectedPhoto)
      return;

    var offsetXInImage = event.clientX - this._imageElement.offsetLeft - this.IMAGE_BORDER_SIZE;
    var offsetYInImage = event.clientY - this._imageElement.offsetTop - this.IMAGE_BORDER_SIZE;
    var offsetXPercent = (offsetXInImage / this._imageElement.clientWidth * 100).toFixed(0);
    var offsetYPercent = (offsetYInImage / this._imageElement.clientHeight * 100).toFixed(0);
    offsetXPercent = Math.min(Math.max(offsetXPercent, 0), 100);
    offsetYPercent = Math.min(Math.max(offsetYPercent, 0), 100);

    // temporary tag for showing highlight while the tag editing popup is shown.
    var tempTag = new Tag("tempTag", offsetXPercent, offsetYPercent);
    this._showTagHighlight(tempTag);

    var fbUsers = gFacebookService.getFriends({});
    var friends = [];
    // Add logged in user so she can tag herself.
    var ownUserName = PhotoUpload._stringBundle.getString("ownUserName");
    ownUserName = ownUserName.replace("%USERNAME%",
                                      gFacebookService.loggedInUser.name);
    friends.push(new Friend(ownUserName, gFacebookService.loggedInUser.id));

    for each (var fbUser in fbUsers) {
      friends.push(new Friend(fbUser.name, fbUser.id));
    }

    var dialogParams = {
      offsetXPercent: offsetXPercent,
      offsetYPercent: offsetYPercent,
      friends: friends,
      TextTag: TextTag,
      PeopleTag: PeopleTag
    };
    openDialog("chrome://facebook/content/photoupload/taggingdialog.xul", null,
               "chrome,modal,centerscreen,titlebar,dialog=yes", dialogParams);
    this._hideTagHighlight();
    if (!dialogParams.tag)
      return;

    var selectedPhoto = PhotoSet.selected;
    if (!selectedPhoto)
      return;
    selectedPhoto.addTag(dialogParams.tag);
    PhotoSet.update(selectedPhoto);
  }
};

/**
 * Manages the Photo edit window.
 */
var PhotoEdit = {

  get _stringBundle() {
    delete this._stringBundle;
    return this._stringBundle = document.getElementById("facebookStringBundle");
  },

  _url: function(spec) {
    var ios = Cc["@mozilla.org/network/io-service;1"].
              getService(Ci.nsIIOService);
    return ios.newURI(spec, null, null);
  },

  init: function() {
    var self = this;

    EditPanel.init();
  },

  uninit: function() {
    var self = this;
    EditPanel.uninit();
  },

  onClose: function() {
    return true;
  }
};
