/**
 *
 * The source code included in this file is licensed to you by Facebook under
 * the Apache License, Version 2.0.  Accordingly, the following notice
 * applies to the source code included in this file:
 *
 * Copyright © 2009-2010 Facebook, Inc.
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

// Debugging.
function LOG(s) {
  if (!opener.LOG)
    return;
  opener.LOG(s);
}

var TaggingDialog = {
  _params: null,
  _friendList: null,
  _tagText: null,

  onLoad: function() {
    this._friendList = document.getElementById("friendList");
    this._tagText = document.getElementById("tagText");

    this._params = window.arguments[0];
    if (!this._params) {
      LOG("Error: no arguments passed to this dialog");
      return;
    }
    this._params.tag = null;
    for each (var friend in this._params.friends) {
      if (!this.contains(this._params.tags, friend.name)) {
        var item = document.createElement("listitem");
        item.setAttribute("label", friend.name);
        item.setAttribute("type", "checkbox");
        item.friend = friend;
        this._friendList.appendChild(item);
      }
    }
  },

  contains: function(arr, value) {
    var i = arr.length;
    while (i--) {
        if (arr[i].label === value) return true;
    }
    return false;
  },

  _getCheckedFriend: function() {
    for (var i = 0; i < this._friendList.itemCount; i++) {
      var item = this._friendList.getItemAtIndex(i);
      if (item.checked)
        return item.friend;
    }
    return null;
  },

  _createPeopleTag: function(friend) {
    var tag = new this._params.PeopleTag(friend,
                                         this._params.offsetXPercent,
                                         this._params.offsetYPercent);
    this._params.tag = tag;
  },

  _createTextTag: function(label) {
    var tag = new this._params.TextTag(label,
                                       this._params.offsetXPercent,
                                       this._params.offsetYPercent);
    this._params.tag = tag;
  },

  onAccept: function() {
    var checkedFriend = this._getCheckedFriend();
    if (checkedFriend) {
      this._createPeopleTag(checkedFriend);
      return;
    }
    if (this._tagText.value.length == 0) {
      return;
    }
    this._createTextTag(this._tagText.value);
  },

  _filterFriends: function(text) {
    function matches(itemText, filterText) {
      // If there is no text, show all items.
      if (filterText == "")
        return true;
      // Case insensitive matching.
      return itemText.search(new RegExp(filterText, "i")) != -1;
    };

    var visibleItemCount = 0;
    var lastVisibleItem;
    for (var i = 0; i < this._friendList.itemCount; i++) {
      var item = this._friendList.getItemAtIndex(i);
      item.setAttribute("checked", "false");
      item.hidden = !matches(item.friend.name, text);
      if (!item.hidden) {
        visibleItemCount++;
        lastVisibleItem = item;
      }
    }
    // If there is only one matched item, select it. When the dialog will be
    // accepted, this item will be used for the tag.
    if (visibleItemCount == 1) {
      lastVisibleItem.checked = true;
      lastVisibleItem.setAttribute("checked", "true");
    }
    // HACK: When list items hidden attribute changes from true to false, they
    // aren't shown back. This hack hides the listbox and shows it again so that
    // these items appear again. The unfortunate side effect is that the
    // listbox flickers.
    this._friendList.hidden = true;
    var self = this;
    setTimeout(function() {
      self._friendList.hidden = false;
    }, 0);
  },

  onTagTextInput: function(event) {
    var acceptButton = document.documentElement.getButton("accept");
    acceptButton.disabled = (this._tagText.value.length == 0);
    this._filterFriends(this._tagText.value);
  },

  onFriendListCommand: function(event) {
    var item = event.target;
    if (!item.friend)
      return;
    this._createPeopleTag(item.friend);
    window.close();
  }
};
