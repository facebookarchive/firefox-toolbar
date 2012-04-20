/**
 *
 * The source code included in this file is licensed to you by Facebook under
 * the Apache License, Version 2.0.  Accordingly, the following notice
 * applies to the source code included in this file:
 *
 * Copyright © 2012 Facebook, Inc.
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

const CC = Components.Constructor;
const Cu = Components.utils;

const FileInputStream = CC("@mozilla.org/network/file-input-stream;1",
                           "nsIFileInputStream",
                           "init");
const StringInputStream = CC("@mozilla.org/io/string-input-stream;1",
                             "nsIStringInputStream")

// Global objects.

// JavaScript semantics is required for some member access, that's why
// we use wrappedJSObject instead of going throught the .idl.
var gFacebookService =  Cc['@facebook.com/facebook-service;1'].
                        getService(Ci.fbIFacebookService).
                        wrappedJSObject;
// Unwrapped version.
var gFacebookServiceUnwrapped =  Cc['@facebook.com/facebook-service;1'].
                                 getService(Ci.fbIFacebookService);

var QuitObserver = {
  observe: function(subject, topic, data) {
    switch (topic) {
      case "quit-application-requested":
        if (!PhotoUpload.canClose()) {
          // deny the application close request
          try {
            let cancelQuit = subject.QueryInterface(Components.interfaces.nsISupportsPRBool);
            cancelQuit.data = true;
          } catch (ex) {
            fbLib.debug("cannot cancel quit: " + ex);
          }
        }
      break;
    }
  }
};

var validImageFileSuffixes = ["jpg", "jpeg", "png", "gif"];

/**
 * This objects represents a photo that is going to be uploaded.
 */
function Photo(/* nsIFile */ file) {
  this.file = file.QueryInterface(Ci.nsIFile);
  this.caption = "";
  this.tags = [];
  this._facebookSize = null;
  this._size = null;
  this.__mimeType = null;
  this.__container = null;
};

Photo.prototype = {
  MAX_WIDTH:  720,
  MAX_HEIGHT: 720,

  get url() {
    var ios = Cc["@mozilla.org/network/io-service;1"].
              getService(Ci.nsIIOService);
    return ios.newFileURI(this.file).spec;
  },

  get _mimeType() {
    if (this.__mimeType)
      return this.__mimeType;
    var filename = this.filename;
    var extension = filename.substring(filename.lastIndexOf("."),
                                       filename.length).toLowerCase();

    var mimeSvc = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
    extension = extension.toLowerCase();
    var dotPos = extension.lastIndexOf(".");
    if (dotPos != -1)
      extension = extension.substring(dotPos + 1, extension.length);
    return this.__mimeType = mimeSvc.getTypeFromExtension(extension);
  },

  get _inputStream() {
    const PR_RDONLY = 0x01;
    var fis = new FileInputStream(this.file, PR_RDONLY, 0444, null);

    var imageStream = Cc["@mozilla.org/network/buffered-input-stream;1"].
                      createInstance(Ci.nsIBufferedInputStream);
    imageStream.init(fis, 4096);
    return imageStream;
  },

  get _container() {
    if (this.__container)
      return this.__container;

    var imgTools = Cc["@mozilla.org/image/tools;1"].
                   getService(Ci.imgITools);
    fbLib.debug("Found mime: " + this._mimeType + " for file " + this.filename);
    var outParam = { value: null };
    imgTools.decodeImageData(this._inputStream, this._mimeType, outParam);
    return this.__container = outParam.value;
  },

  get size() {
    if (this._size)
      return this._size;
    var container = this._container;
    return this._size = [container.width, container.height];
  },

  get facebookSize() {
    if (this._facebookSize)
      return this._facebookSize;

    if (this.size[0] < this.MAX_WIDTH && this.size[1] < this.MAX_HEIGHT) {
      return this._facebookSize = this.size;
    }
    var [oldWidth, oldHeight] = this.size;
    fbLib.debug("resizing image. Original size: " + oldWidth + " x " + oldHeight);
    var newWidth, newHeight;
    var ratio = oldHeight / oldWidth;
    if (oldWidth > this.MAX_WIDTH) {
      newWidth = this.MAX_WIDTH;
      newHeight = oldHeight * (this.MAX_WIDTH / oldWidth);
    } else if (oldHeight > this.MAX_HEIGHT) {
      newHeight = this.MAX_HEIGHT;
      newWidth = oldWidth * (this.MAX_HEIGHT / oldHeight);
    } else {
      fbLib.debug("Unexpected state");
    }
    fbLib.debug("new size: " + [newWidth, newHeight]);
    return this._facebookSize = [newWidth, newHeight];
  },

  get sizeInBytes() {
    return this.file.fileSize;
  },
  get filename() {
    return this.file.leafName;
  },
  addTag: function(tag) {
    this.tags.push(tag);
  },
  removeTag: function(tag) {
    this.tags = this.tags.filter(function(p) p != tag);
  },
  toString: function() {
    return "<Photo file: " + this.filename + ">";
  },

  get resizedInputStream() {
    var fbSize = this.facebookSize;
    if (this.size[0] == fbSize[0] &&
        this.size[1] == fbSize[1]) {
      fbLib.debug("no resizing needed");
      return this._inputStream;
    }
    var imgTools = Cc["@mozilla.org/image/tools;1"].
                   getService(Ci.imgITools);
    try {
      return imgTools.encodeScaledImage(this._container, this._mimeType, fbSize[0], fbSize[1]);
    } catch (e) {
      throw "Failure while resizing image: " + e;
    }
  }
};

const BOUNDARY = "facebookPhotoUploaderBoundary";

// Change notification constants:

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

/**
 * This object (singleton) represent the list of photos that will be uploaded
 * or that can be edited.
 */
var PhotoSet = {
  // Array of Photo objects.
  _photos: [],
  // Currently selected Photo object.
  _selected: null,
  // Listeners wanted to get notified when a photo changes.
  // Stored as (function callback, context object) pairs.
  _listeners: [],
  _cancelled: false,

  add: function(photos) {
    // don't re-add any photos (bug 913)
    var photos2 = [];

    outer: for (var i=0; i<photos.length; i++) {
      for (var j=0; j<this._photos.length; j++) {
        if (this._photos[j].file && this._photos[j].file.equals(photos[i].file)) {
          fbLib.debug("will not add duplicate image");
          //delete photos[i];
          continue outer;
        }
      }

      photos2.push(photos[i]);
    }

    if (photos2.length == 0) {
        this._selected = photos[photos.length - 1];
        return;
    }

    Array.prototype.push.apply(this._photos, photos2)
    this._notifyChanged(CHANGE_ADD, photos2);

    // Selects the last added photos. When adding only one photo, that's
    // useful to have it selected for direct metadata editing.
    this._selected = photos2[photos2.length - 1];
    this._updateSelected();
  },

  _updateSelected: function() {
    var p = this._photos.filter(function(p) p == this._selected, this);
    if (p.length > 1) {
      fbLib.debug("ERROR: more than one selected photo?");
      return;
    }
    if (p.length == 0) {
      fbLib.debug("No selected photo");
      this._selected = null;
    }
    this._notifyChanged(CHANGE_SELECTED, this._selected);
  },

  removeAll: function() {
    this._photos = [];
    this._notifyChanged(CHANGE_REMOVE_ALL);
    this._updateSelected();
  },

  remove: function(photo) {
    var photoIndex = this._photos.indexOf(photo);
    if (photoIndex == -1) {
      fbLib.debug("Warning: trying to remove a photo not in set");
      return;
    }
    this._photos.splice(photoIndex, 1);
    this._notifyChanged(CHANGE_REMOVE, photo);

    // Select the photo just after the removed one.
    var selectedIndex = Math.min(photoIndex, this._photos.length - 1);
    this._selected = this._photos[selectedIndex];
    this._updateSelected();
  },

  _ensurePhotoExists: function(photo) {
    var p = this._photos.filter(function(p) p == photo);
    if (p.length == 0) {
      fbLib.debug("ERROR: photo does not exist in set");
      return false;
    }
    if (p.length > 1) {
      fbLib.debug("ERROR: more than one photo matching?");
      return false;
    }
    return true;
  },

  update: function(photo) {
    if (!this._ensurePhotoExists(photo))
      return;

    // The modified photo should be a reference to the photo in the set.
    // So there is nothing to update.

    this._notifyChanged(CHANGE_UPDATE, photo);
  },

  get selected() {
    return this._selected;
  },

  set selected(photo) {
    if (!this._ensurePhotoExists(photo))
      return;
    if (this._selected == photo)
      return;
    this._selected = photo;
    this._updateSelected();
  },

  get photos() {
    return this._photos;
  },

  _notifyChanged: function(changeType, parameter) {
    this._listeners.forEach(function(listener) {
      var [func, context] = listener;
      func.call(context, changeType, parameter);
    }, this);
  },

  addChangedListener: function(func, context) {
    this._listeners.push([func, context]);
  },

  removeChangedListener: function(func, context) {
    this._listeners = this._listeners.filter(hasFilter);
    function hasFilter(listener) {
      return listener[0] != func && listener[1] != context;
    }
  },

  _getUploadStream: function(photo, params) {
    const EOL = "\r\n";

    // Header stream.
    var header = "";

    for (let [name, value] in Iterator(params)) {
      header += "--" + BOUNDARY + EOL;
      header += "Content-disposition: form-data; name=\"" + name + "\"" + EOL + EOL;
      header += value;
      header += EOL;
    }

    header += "--" + BOUNDARY + EOL;
    header += "Content-disposition: form-data;name=\"filename\"; filename=\"" +
              photo.file.leafName + "\"" + EOL;
    // Apparently Facebook accepts binay content type and will sniff the file
    // for the correct image mime type.
    header += "Content-Type: application/octet-stream" + EOL;
    header += EOL;

    // Convert the stream to UTF-8, otherwise bad things happen.
    // See http://developer.taboca.com/cases/en/XMLHTTPRequest_post_utf-8/
    var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
                    createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    var headerStream = converter.convertToInputStream(header);

    var mis = Cc["@mozilla.org/io/multiplex-input-stream;1"].
              createInstance(Ci.nsIMultiplexInputStream);
    mis.appendStream(headerStream);

    // Image stream
    mis.appendStream(photo.resizedInputStream);

    // Ending stream
    var endingStream = new StringInputStream();
    var boundaryString = "\r\n--" + BOUNDARY + "--\r\n";
    endingStream.setData(boundaryString, boundaryString.length);
    mis.appendStream(endingStream);

    return mis;
  },

  _uploadPhoto: function(albumId, photo, onProgress, onComplete, onError) {
    fbLib.debug("Uploading photo: " + photo);

    var params = {};

    // method specific:

    if (photo.caption)
      params.caption = photo.caption;

    for (let [name, value] in Iterator(gFacebookService.getCommonParams())) {
        params[name] = value;
    }

    // Builds another array of params in the format accepted by generateSig()
    var paramsForSig = [];
    for (let [name, value] in Iterator(params)) {
      paramsForSig.push(name + "=" + value);
    }
    params.sig = gFacebookService.generateSig(paramsForSig);

    //const RESTSERVER = 'http://api.facebook.com/restserver.php';

    var xhr = new XMLHttpRequest();

    function updateProgress(event) {
      if (!event.lengthComputable)
        return;
      onProgress((event.loaded / event.total) * 100);
    }

    // Progress handlers have to be set before calling open(). See
    // https://bugzilla.mozilla.org/show_bug.cgi?id=311425

    // The upload property is not available with Firefox 3.0
    if (xhr.upload) {
      xhr.upload.onprogress = updateProgress;
    }

    var postURL = "https://graph.facebook.com/" + albumId + "/photos?access_token=" + gFacebookService.accessToken;
    fbLib.debug("post url = " + postURL);

    xhr.open("POST", postURL);
    xhr.setRequestHeader("Content-Type", "multipart/form-data; boundary=" + BOUNDARY);
    xhr.setRequestHeader("MIME-version", "1.0");

    xhr.onreadystatechange = function(event) {
      fbLib.debug("onreadstatechange " + xhr.readyState)
      if (xhr.readyState != 4)
        return;

      fbLib.debug("upload api response: " + xhr.responseText);

      try {
        var data = JSON.parse(xhr.responseText);
      } catch(e) {
        onError("Failed to parse JSON");
        return;
      }
      // Duplicated from facebook.js::callMethod
      if (typeof data.error_code != "undefined") {
        onError("Server returned an error: " + data.error_msg);
        return;
      }
      onComplete(data.id);
    }
    xhr.onerror = function(event) {
      onError("XMLHttpRequest error");
    }

    xhr.send(this._getUploadStream(photo, params));
  },

  _tagPhoto: function(photo, photoId, onComplete, onError) {
    for each (tag in photo.tags)
    {
        var xhr = new XMLHttpRequest();

        var postURL = "https://graph.facebook.com/" + photoId + "/tags/" + tag.friend.uid  + "?access_token=" + gFacebookService.accessToken;
        //fbLib.debug("tag url = " + postURL);

        xhr.open("POST", postURL);

        xhr.onreadystatechange = function(event) {
          if (xhr.readyState != 4)
            return;

          //fbLib.debug("tag api response: " + xhr.responseText);

          try {
            var data = JSON.parse(xhr.responseText);
          } catch(e) {
            onError("Failed to parse JSON");
            return;
          }
          // Duplicated from facebook.js::callMethod
          if (typeof data.error_code != "undefined") {
            onError("Server returned an error: " + data.error_msg);
            return;
          }
        }

        xhr.send("x="+tag.x+"&y="+tag.y);
    }

    onComplete();
  },

  _uploadAndTagPhoto: function(albumId, photo, onProgress, onComplete, onError) {
    this._uploadPhoto(albumId, photo, onProgress,
      function(photoId) { // onComplete callback
        fbLib.debug("finished upload photo (id= " + photoId + "), will tag");
        PhotoSet._tagPhoto(photo, photoId, onComplete, onError);
      },
    onError);
  },

  upload: function(albumId, onProgress, onComplete, onError) {
    this._cancelled = false;
    var toUpload = this._photos;
    var total = toUpload.length;
    var index = 0;
    var self = this;

    var totalSizeBytes = [photo.sizeInBytes for each (photo in toUpload)].
                             reduce(function(a, b) a + b);
    var uploadedBytes = 0;

    function doUpload() {
      if (self._cancelled) {
        fbLib.debug("Upload cancelled");
        onComplete(true);
        return;
      }
      if (index == total) {
        fbLib.debug("PhotoSet.upload: index != total, How could that happen?");
        return;
      }
      var photo = toUpload[index];
      if (!photo) {
        fbLib.debug("PhotoSet.upload: no photo to upload, How could that happen?");
        return;
      }
      var photoSize = photo.sizeInBytes;

      try {
        self._uploadAndTagPhoto(albumId, photo,
          function(photoPercent) { // onProgress callback
            fbLib.debug("on progress from photo upload " + photoPercent);
            var donePercent = (uploadedBytes / totalSizeBytes) * 100;
            var photoRelativePercent = photoPercent * (photoSize / totalSizeBytes);
            onProgress(donePercent + photoRelativePercent);
          }, function() { // onComplete callback
            index++;
            uploadedBytes += photoSize;
            // Call progress here for Firefox 3.0 which won't get progress
            // notification during image upload.
            onProgress((uploadedBytes / totalSizeBytes) * 100)

            if (index == total) {
              onComplete(false);
              self.removeAll();
            } else {
              doUpload();
            }
          }, onError);
      } catch (e) {
        onError("Failure during upload: " + e);
      }
    }
    doUpload();
  },

  cancelUpload: function() {
    this._cancelled = true;
  }
};

/**
 * Manages the UI for displaying and manipulating the list of photos.
 */
var OverviewPanel = {
  _panelDoc: null,
  _photoContainer: null,

  init: function() {
    PhotoSet.addChangedListener(this.photosChanged, OverviewPanel);
    this._panelDoc = document.getElementById("overviewPanel").contentDocument;
    this._photoContainer = this._panelDoc.getElementById("photo-container");
  },

  uninit: function() {
    PhotoSet.removeChangedListener(this.photosChanged, OverviewPanel);
  },

  _iteratePhotoNodes: function(callback, context) {
    var node = this._photoContainer.firstChild;
    while (node) {
      var nextNode = node.nextSibling;
      if (node.nodeType == Node.ELEMENT_NODE &&
          node.className == "photobox" &&
          node.id != "photobox-template") {
        callback.call(context, node);
      }
      node = nextNode;
    }
  },

  _getNodeFromPhoto: function(photo) {
    var photoNode = null;
    this._iteratePhotoNodes(function(node) {
      if (node.photo == photo)
        photoNode = node;
    }, this);
    return photoNode;
  },

  _updateSelected: function(photo) {
    this._iteratePhotoNodes(function(node) {
      node.removeAttribute("selected");
    }, this);
    var photoNode = this._getNodeFromPhoto(photo);
    if (photoNode)
      photoNode.setAttribute("selected", "true");
  },

  photosChanged: function(changeType, parameter) {
    fbLib.debug("OverviewPanel::PhotosChanged " + changeType);

    if (changeType == CHANGE_SELECTED) {
      var selectedPhoto = parameter;
      this._updateSelected(selectedPhoto);
      return;
    }
    if (changeType == CHANGE_REMOVE_ALL) {
      this._iteratePhotoNodes(function(node) {
        this._photoContainer.removeChild(node);
      }, this);
      return;
    }
    if (changeType == CHANGE_REMOVE) {
      var toRemovePhoto = parameter;
      var photoNode = this._getNodeFromPhoto(toRemovePhoto);
      if (!photoNode) {
        fbLib.debug("Warning: can't find node of the photo to remove");
        return;
      }
      this._photoContainer.removeChild(photoNode);
      return;
    }

    if (changeType == CHANGE_UPDATE) {
      var imgs = OverviewPanel._photoContainer.getElementsByTagName("img");
      
      for (var i=0; i<imgs.length; i++)
      {
          imgs[i].setAttribute("src", imgs[i].getAttribute("src"));
      }
    }

    if (changeType == CHANGE_ADD) {
      var toAddPhotos = parameter;
      var photoboxTemplate = this._panelDoc.getElementById("photobox-template");
      toAddPhotos.forEach(function(photo) {
        var newBox = photoboxTemplate.cloneNode(true);
        newBox.photo = photo;
        newBox.removeAttribute("id");
        newBox.getElementsByTagName("img")[0].src = photo.url;
        //var filenameDiv = newBox.getElementsByClassName("filename")[0];
        //filenameDiv.firstChild.data = photo.filename;
        newBox.getElementsByTagName("div")[0].addEventListener("click", function() { OverviewPanel.removePhoto(photo); }, false);
        newBox.getElementsByTagName("img")[0].addEventListener("click", function() { OverviewPanel.editPhoto(photo); }, false);

        photoboxTemplate.parentNode.insertBefore(newBox, photoboxTemplate);
      });
      return;
    }
  },

  _photoFromEvent: function(event) {
    event.stopPropagation();
    var node = event.target;
    while (node) {
      if (node.photo)
        return node.photo;
      node = node.parentNode;
    }
    return null;
  },

  selectPhoto: function(event) {
    var photo = this._photoFromEvent(event);
    if (!photo) {
      fbLib.debug("Error, photo not found");
      return;
    }
    PhotoSet.selected = photo;
  },

  //removePhoto: function(event) {
  removePhoto: function(photo) {
    //var photo = this._photoFromEvent(event);
    if (!photo) {
      fbLib.debug("Error, photo not found");
      return;
    }
    PhotoSet.remove(photo);
  },

  editPhoto: function(photo) {
    if (!photo) {
      fbLib.debug("Error, photo not found");
      return;
    }
    window.openDialog('chrome://facebook/content/photoupload/photoedit.xul',
                      'facebook:photoedit',
                      'chrome,modal,centerscreen,titlebar,dialog=yes',
                      photo,
                      PhotoSet);
  }
};

var PhotoDNDObserverLegacy = {
  getSupportedFlavours : function () {
    var flavours = new FlavourSet();
    flavours.appendFlavour("text/x-moz-url");
    flavours.appendFlavour("application/x-moz-file",  "nsIFile");
    return flavours;
  },

  _getFilesFromDragSession: function (session, position) {
    var theseFiles = [];
    var tmpfile;
    var fileData = { };
    var ios = Cc["@mozilla.org/network/io-service;1"].
              getService(Ci.nsIIOService);
    // if this fails we do not have valid data to drop
    try {
      var xfer = Cc["@mozilla.org/widget/transferable;1"].
                 createInstance(Ci.nsITransferable);
      xfer.addDataFlavor("text/x-moz-url");
      xfer.addDataFlavor("application/x-moz-file", "nsIFile");
      session.getData(xfer, position);

      var flavour = { }, data = { }, length = { };
      xfer.getAnyTransferData(flavour, data, length);
      var selectedFlavour = this.getSupportedFlavours().flavourTable[flavour.value];
      var xferData = new FlavourData(data.value, length.value, selectedFlavour);

      var fileURL = transferUtils.retrieveURLFromData(xferData.data,
                                                      xferData.flavour.contentType);
      var urlObj = ios.newURI(fileURL, null, null);

      if (xferData.flavour.contentType == "application/x-moz-file"
          || xferData.flavour.contentType == "text/x-moz-url")
      {
          tmpfile = ios.newURI(fileURL, null, null).QueryInterface(Ci.nsIFileURL).file;

          var isValidImageFile = function(f)
          {
              var ext = f.path.substring(f.path.lastIndexOf(".")+1);

              return (validImageFileSuffixes.indexOf(ext.toLowerCase()) != -1);
          };

          if (tmpfile.isDirectory())
          {
              var getFilesInDirectory = function(dir)
              {
                  var files = [];
                  var entries = dir.directoryEntries;

                  while (entries.hasMoreElements())
                  {
                      var entry = entries.getNext();
                      entry.QueryInterface(Components.interfaces.nsIFile);

                      if (entry.isDirectory())
                      {
                          files = files.concat(getFilesInDirectory(entry));
                      }
                      else
                      {
                          if (isValidImageFile(entry))
                              files.push(entry);
                      }
                  }

                  return files;
              };
    
              theseFiles = getFilesInDirectory(tmpfile);
              tmpfile = null;
          }
          else
          {
              if (!isValidImageFile(tmpfile))
                  return null;
          }
      }
      else
      {
          tmpfile = Components.classes["@mozilla.org/file/directory_service;1"].
              getService(Components.interfaces.nsIProperties).
              get("TmpD", Components.interfaces.nsIFile);
          tmpfile.append("facebookphoto.jpg");
          tmpfile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);

          var wbp = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1']
              .createInstance(Components.interfaces.nsIWebBrowserPersist);
          wbp.persistFlags &= ~Components.interfaces.nsIWebBrowserPersist.PERSIST_FLAGS_NO_CONVERSION; // don't save gzipped
          wbp.progressListener = {
            onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
                //
            },
            onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) {
                if(aFlag & Components.interfaces.nsIWebProgressListener.STATE_STOP)  
                {
                    PhotoSet._notifyChanged(CHANGE_UPDATE);
                }
            }
          };
          wbp.saveURI(urlObj, null, null, null, null, tmpfile);
      }

      if (tmpfile)
          theseFiles.push(tmpfile);
    } catch (e) {
      fbLib.debug("Exception while getting drag data: " + e);
      return null;
    }

    return theseFiles;
  },

  onDrop: function (event, dropdata, session) {
    var count = session.numDropItems;
    var files = [];
    for (var i = 0; i < count; ++i) {
      var theseFiles = this._getFilesFromDragSession(session, i);
      if (theseFiles)
      {
        theseFiles.forEach(function(file) { files.push(file); });
      }
    }
    PhotoSet.add([new Photo(f) for each (f in files)]);
  }
};

/*** Drag Drop Observer for new API ***/
var PhotoDNDObserver = {
  checkDrag : function (event) {
      return event.dataTransfer.types.contains("text/x-moz-url") || 
        event.dataTransfer.types.contains("application/x-moz-file");
  },

  _getFilesFromDragSession: function (dt)
  {
      var theseFiles = [];

      var isValidImageFile = function(f)
      {
          var ext = f.path.substring(f.path.lastIndexOf(".")+1);

          return (validImageFileSuffixes.indexOf(ext.toLowerCase()) != -1);
      };

      for (var i=0; i<dt.mozItemCount; i++)
      {
          var types = dt.mozTypesAt(i);
          if (types.contains("application/x-moz-file"))
          {
              var tmpfile = dt.mozGetDataAt("application/x-moz-file", i).QueryInterface(Ci.nsIFile);

              if (tmpfile.isDirectory())
              {
                  fbLib.debug("Dropped a directory; iterating");

                  var getFilesInDirectory = function(dir)
                  {
                      var files = [];
                      var entries = dir.directoryEntries;

                      while (entries.hasMoreElements())
                      {
                          var entry = entries.getNext();
                          entry.QueryInterface(Components.interfaces.nsIFile);

                          if (entry.isDirectory())
                          {
                              files = files.concat(getFilesInDirectory(entry));
                          }
                          else
                          {
                              if (isValidImageFile(entry))
                                  files.push(entry);
                          }
                      }

                      return files;
                  };

                  theseFiles = getFilesInDirectory(tmpfile);
              }
              else if (isValidImageFile(tmpfile))
              {
                  fbLib.debug("Dropped a valid image file");
                  theseFiles.push(tmpfile);
              }
              else
              {
                  fbLib.debug("Unsupported file type dropped");
              }
          }
          else if (types.contains("text/x-moz-url"))
          {
              try
              {
                  var tmpfile = Components.classes["@mozilla.org/file/directory_service;1"].
                      getService(Components.interfaces.nsIProperties).
                      get("TmpD", Components.interfaces.nsIFile);
                  tmpfile.append("facebookphoto.jpg");
                  tmpfile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);

                  var wbp = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1']
                      .createInstance(Components.interfaces.nsIWebBrowserPersist);
                  wbp.persistFlags &= ~Components.interfaces.nsIWebBrowserPersist.PERSIST_FLAGS_NO_CONVERSION; // don't save gzipped
                  wbp.progressListener = {
                    onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
                        //
                    },
                    onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) {
                        if(aFlag & Components.interfaces.nsIWebProgressListener.STATE_STOP)  
                        {
                            PhotoSet._notifyChanged(CHANGE_UPDATE);
                        }
                    }
                  };

                  var urldatabits = dt.mozGetDataAt("text/x-moz-url", i).split(/\n/);
                  fbLib.debug("Downloading image from: " + urldatabits[0]);
                  var urlObj = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService).newURI(urldatabits[0], null, null);
                  wbp.saveURI(urlObj, null, null, null, null, tmpfile);

                  theseFiles.push(tmpfile);
              }
              catch (e)
              {
                  fbLib.debug("Error downloading image: " + e);
              }
          }
          else
          {
              fbLib.debug("Unsupported drop type: " + types[i]);
          }
      }

      return theseFiles;
  },

  onDragOver: function(event) {
      event.dataTransfer.dropEffect = "copy";
      event.preventDefault();
      return false;
  },

  onDrop: function (event) {
    fbLib.debug("In drop handler");

    event.preventDefault(); event.stopPropagation();

    var files = [];
    var theseFiles = PhotoDNDObserver._getFilesFromDragSession(event.dataTransfer);
    if (theseFiles)
    {
        theseFiles.forEach(function(file) { files.push(file); });
    }

    PhotoSet.add([new Photo(f) for each (f in files)]);

    return false;
  }
};

const NEW_ALBUM = 0;
const EXISTING_ALBUM = 1;

//const PROFILE_PICTURES_URL_ALBUM_ID = "4294967293"; // -3 in two's complement 32bit integer.

const POST_UPLOAD_ASKUSER = 0;
const POST_UPLOAD_OPENALBUM = 1;
const POST_UPLOAD_STAYHERE = 2;

const UPLOAD_CANCELLED = 0;
const UPLOAD_COMPLETE = 1;
const UPLOAD_ERROR = 2;

/**
 * Manages the Photo upload window.
 */
var PhotoUpload = {
  _uploadCancelled: false,
  _uploadStatus: null,
  _uploadStatusDeck: null,
  _uploadStatusBox: null,
  _uploadProgress: null,
  _uploadBroadcaster: null,
  _observerService: null,
  _quitObserver: null,

  get _stringBundle() {
    delete this._stringBundle;
    return this._stringBundle = document.getElementById("photouploadBundle");
  },

  _url: function(spec) {
    var ios = Cc["@mozilla.org/network/io-service;1"].
              getService(Ci.nsIIOService);
    return ios.newURI(spec, null, null);
  },

  usesLegacyDND: function() {
     var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
     var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
     return (versionChecker.compare(appInfo.version, "4.0b1") < 0);
  },

  init: function() {
    var self = this;

    if (PhotoUpload.usesLegacyDND())
    {
        fbLib.debug("Switching to legacy DND");
        document.getElementById("picBox").setAttribute("ondragdrop", "nsDragAndDrop.drop(event, PhotoDNDObserverLegacy)");
    }
    else
    {
        document.getElementById("overviewPanel").addEventListener("drop", PhotoDNDObserver.onDrop, true);
        document.getElementById("overviewPanel").addEventListener("dragover", PhotoDNDObserver.onDragOver, true);
    }

    OverviewPanel.init();
    PhotoSet.addChangedListener(this.photosChanged, PhotoUpload);

    this._uploadStatus = document.getElementById("uploadStatus")
    this._uploadStatusDeck = document.getElementById("uploadStatusDeck");
    this._uploadStatusBox = document.getElementById("uploadStatusBox");
    this._uploadProgress = document.getElementById("uploadProgress");
    this._uploadBroadcaster = document.getElementById("uploadBroadcaster");

    // Observe when the application wants to quit
    this._observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    this._observerService.addObserver(QuitObserver, "quit-application-requested", false);

    // New album default name
    /*
    var defaultAlbumName = this._stringBundle.getString("defaultAlbumName");
    defaultAlbumName = defaultAlbumName.replace("%DATE%", new Date().toLocaleDateString());
    document.getElementById("albumName").value = defaultAlbumName;
   */

    // When closing the login dialog, the loggedInUser property is not set
    // immediatly. Wait a few moment before asking the user to log in.

    const LOGGED_IN_POLL_TIMEOUT = 1000;
    const NUM_TRIES = 5;

    var self = this;
    var tries = 0;

    function checkIfLoggedIn() {
      fbLib.debug("Checking if user is logged in, try " + (tries + 1) + " / " + NUM_TRIES);
      tries++;
      if (tries == NUM_TRIES) {
        alert(self._stringBundle.getString("mustLoginDialog"));
        window.close();
        return;
      }
      if (!gFacebookServiceUnwrapped.loggedInUser) {
        fbLib.debug("not logged in, retrying");
        setTimeout(checkIfLoggedIn, LOGGED_IN_POLL_TIMEOUT);
        return;
      }
      fbLib.debug("logged in");
      self._checkPhotoUploadPermission(function() {
          fbLib.debug("photo permissions ok - filling album list");
          self._fillAlbumList();
      });
    }

    checkIfLoggedIn();
  },

  uninit: function() {
    var self = this;
    OverviewPanel.uninit();
    //EditPanel.uninit();
    PhotoSet.removeChangedListener(this.photosChanged, PhotoUpload);

    this._observerService.removeObserver(QuitObserver, "quit-application-requested");

/*
    if (this.getAlbumSelectionMode() == EXISTING_ALBUM) {
      var albumsList = document.getElementById("albumsList");
      if (!albumsList.selectedItem)
        return;
      var albumId = albumsList.selectedItem.getAttribute("albumid");
      document.getElementById("albumsList").setAttribute("lastalbumid", albumId);
    }
*/
    document.persist("albumsList", "lastalbumid");
  },

  /**
   * canClose:
   * returns true if there are no uploads
   * returns true if there ARE uploads, but user wants to cancel them
   * returns false if there ARE uploads, but user wants to let them finish
   */
  canClose: function() {
    var self = this;
    var isUploading = (this._uploadProgress.value > 0);

    if (!isUploading) {
      return true;
    }

    var showConfirmCloseWhileUploadingPrompt = function() {
      const IPS = Ci.nsIPromptService;
      var ps = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(IPS);

      var dummy = {value: false};

      var flags = IPS.BUTTON_POS_0 * IPS.BUTTON_TITLE_IS_STRING +
        IPS.BUTTON_POS_1 * IPS.BUTTON_TITLE_IS_STRING;

      var ret = ps.confirmEx(
          window,
          self._stringBundle.getString("showConfirmCloseWhileUploadingPromptTitle"),
          self._stringBundle.getString("showConfirmCloseWhileUploadingPromptText"),
          flags,
          self._stringBundle.getString("showConfirmCloseWhileUploadingPromptLetUploadFinish"),
          self._stringBundle.getString("showConfirmCloseWhileUploadingPromptCancelUploadAndClose"),
          null,
          null,
          dummy
          );

      return (ret == 0);
    };

    if (showConfirmCloseWhileUploadingPrompt()) {
      return false;
    }

    fbLib.debug("canClose() : user wants to continue with window close, will cancel uploads");

    self.cancelUpload();

    return true;
  },

  _fillAlbumList: function(callback) {

    var self = this;
    var albumsPopup = document.getElementById("albumsPopup");

    while (albumsPopup.getElementsByTagName("menuitem").length > 2)
    {
        albumsPopup.removeChild(albumsPopup.firstChild);
    }

    var handleResponse = function(response)
    {
        // Remove albums not of type 'normal'
        // This includes "Profile Pictures". "Mobile Uploads" and "Wall Photos"
        // Uploading to some of these albums generates errors.

        var albums = response.data;

        albums = albums.filter(function(a) {
          fbLib.debug("album '" + a.name + "' has an id of '" + a.id + "'; album type = " + a.type);
          return a.type == "normal";
        });

        if (albums.length == 0) {
          fbLib.debug("No albums");
          if (callback)
              callback();
          return;
        }
        var albumsPopupPlaceHolder = document.getElementById("albumsPopupPlaceHolder");
        var lastAlbumId = document.getElementById("albumsList")
                                  .getAttribute("lastalbumid");

        var selectedItem;
        for each (var album in albums) {

          var dupe = false;

          for (var i=0; i<albumsPopup.getElementsByTagName("menuitem").length; i++)
          {
              if (albumsPopup.getElementsByTagName("menuitem")[i].hasAttribute("id")
                  && albumsPopup.getElementsByTagName("menuitem")[i].getAttribute("id") == album.id)
              {
                  dupe = true;
              }
          }

          if (dupe)
              continue;

          var menuitem = document.createElement("menuitem");
          menuitem.setAttribute("label", album.name);
          menuitem.setAttribute("id", album.id);
          menuitem.setAttribute("link", album.link);
          if (album.id == lastAlbumId)
            selectedItem = menuitem;
          fbLib.debug("Album name: " + album.name + " id: " + album.id );
          albumsPopup.insertBefore(menuitem, albumsPopupPlaceHolder);
        }
        var albumsList = document.getElementById("albumsList");
        if (selectedItem) {
          albumsList.selectedItem = selectedItem;
        } else {
          albumsList.selectedIndex = 0;
        }

        if (response.paging.next)
        {
            fbLib.debug("fillAlbumList: getting next page of data from '" + response.paging.next +  "'");
            fbSvc.wrappedJSObject.fetchGraphObject(response.paging.next, null, handleResponse);
        }
        else
        {
            if (callback)
                callback();
        }
      };

    fbSvc.wrappedJSObject.fetchGraphObject("me/albums", null, handleResponse);
  },

  _checkPhotoUploadPermission: function(callback) {
    var self = this;

    var checkAppPermission = function(perm, internalCallback) {
        fbLib.debug("Checking photo upload permission '"+perm+"'");

        gFacebookService.callMethod('facebook.users.hasAppPermission',
          ['ext_perm=' + perm],
          function(data) {
            fbLib.debug("facebook.users.hasAppPermission[" + perm + "] returns: "
                + data + " ts " + data.toString());
            // It previously returned the '1' string, but this changed to 'true'
            // in mid April 2009. Check both in case it changes again.
            if ('1' == data.toString() || 'true' == data.toString()) {
              fbLib.debug("photo upload ['" + perm + "'] is authorized");
              internalCallback();
              return;
            }

            let promptTitle = self._stringBundle.getString("allowUploadTitle");
            let promptMessage = self._stringBundle.getString("allowUploadMessage");
            let openAuthorize = self._stringBundle.getString("openAuthorizePage");

            const IPS = Ci.nsIPromptService;
            let ps = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(IPS);
            let rv = ps.confirmEx(window, promptTitle, promptMessage,
                                  (IPS.BUTTON_TITLE_IS_STRING * IPS.BUTTON_POS_0) +
                                  (IPS.BUTTON_TITLE_CANCEL * IPS.BUTTON_POS_1),
                                  openAuthorize, null, null, null, {value: 0});

            if (rv != 0)
            {
              internalCallback();
              return;
            }

            var authorizeUrl = "http://www.facebook.com/authorize.php?api_key=" +
                               gFacebookService.apiKey +"&v=1.0&ext_perm=" + perm;
            Application.activeWindow.open(self._url(authorizeUrl)).focus();
            window.close();
          }
        );
    };

    checkAppPermission("photo_upload", function()
    {
        checkAppPermission("user_photos", function()
        {
            if (callback)
                callback();
        });
    });
  },

  photosChanged: function(changeType, parameter) {
    document.getElementById("uploadButton").disabled = PhotoSet.photos.length == 0;

    if (document.getElementById("overviewPanel").contentDocument) {
        document.getElementById("overviewPanel").contentDocument.getElementById("dragpanel").style.display = (PhotoSet.photos.length==0?"block":"none");
        document.getElementById("overviewPanel").contentDocument.getElementById("photo-container").style.display = (PhotoSet.photos.length==0?"none":"inline-block");
    }
  },

  addPhotos: function() {
    var fp = Cc["@mozilla.org/filepicker;1"].
             createInstance(Ci.nsIFilePicker);
    var aTitle = "";
    try {
      aTitle = this._stringBundle.getString("filePickerTitle");
    }
    catch(e) {
      aTitle = "Select Photos";
      //fbLib.debug("Filepicker title failure: "+e);
    }
    fp.init(window, aTitle,
            Ci.nsIFilePicker.modeOpenMultiple);
    fp.appendFilters(Ci.nsIFilePicker.filterImages);
    if (fp.show() != Ci.nsIFilePicker.returnCancel) {
      var photos = [];
      var filesEnum = fp.files;
      while (filesEnum.hasMoreElements()) {
        photos.push(new Photo(filesEnum.getNext()));
      }
      PhotoSet.add(photos);
    }
  },

  removeAllPhotos: function() {
    PhotoSet.removeAll();
  },

  cancelUpload: function() {
    this._uploadCancelled = true;
    PhotoSet.cancelUpload();
  },

  /**
   * Converts the album id that is used in the Facebook API to the album id
   * that is used in the aid GET parameter of the editalbum.php page.
   */
  _albumIdToUrlAlbumId: function(albumId) {
    // the url album id is the least significant 32 bits of the api-generated
    // album id, the user id is the most significant 32 bits.

    // Javascript Number are 64bit floating point. The albumid is a 64bit integer.
    // That number is too big to be handled directly without loss of precision,
    // so we use an external library for calculation.
    var id = new BigInteger(albumId, 10);
    var mask = new BigInteger("ffffffff", 16);
    var urlAlbumId = id.and(mask);
    return urlAlbumId.toString(10);
  },

  _showUploadCompleteNotification: function(albumId) {
    try {
      let upText = this._stringBundle.getString("uploadCompleteAlert");
      //let aid = "aid=" + this._albumIdToUrlAlbumId(albumId) + "&";
      //let postUploadUrl = "http://www.facebook.com/editalbum.php?" + aid + "org=1";

      if (document.getElementById("albumsList").selectedItem)
          var link = document.getElementById("albumsList").selectedItem.getAttribute("link");

      gFacebookService.showPopup('upload.complete', 'chrome://facebook/skin/images/photo.gif',
                                 upText, link);
    }
    catch(e) {
      fbLib.debug("Error showing upload complete alert: " + e);
    }
  },

  _maybeOpenAlbumPage: function(albumId) {
    var prefSvc = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
    var postUploadAction = prefSvc.getIntPref("extensions.facebook.postuploadaction");

    if (postUploadAction == POST_UPLOAD_ASKUSER) {
      let promptTitle = this._stringBundle.getString("uploadCompleteTitle");
      let promptMessage = this._stringBundle.getString("uploadCompleteMessage");
      let checkboxLabel = this._stringBundle.getString("rememberDecision");
      let goToAlbum = this._stringBundle.getString("goToAlbum");
      let stayHere = this._stringBundle.getString("stayHere");

      const IPS = Ci.nsIPromptService;
      let ps = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(IPS);
      let remember = { value: false };
      let rv = ps.confirmEx(window, promptTitle, promptMessage,
                            (IPS.BUTTON_TITLE_IS_STRING * IPS.BUTTON_POS_0) +
                            (IPS.BUTTON_TITLE_IS_STRING * IPS.BUTTON_POS_1),
                            goToAlbum, stayHere, null, checkboxLabel, remember);

      postUploadAction = rv == 0 ? POST_UPLOAD_OPENALBUM : POST_UPLOAD_STAYHERE;
      if (remember.value) {
        prefSvc.setIntPref("extensions.facebook.postuploadaction", postUploadAction);
      }
    }
    if (postUploadAction == POST_UPLOAD_STAYHERE)
      return;

    if (postUploadAction == POST_UPLOAD_OPENALBUM) {
        /*
      var aid = "";
      aid = "aid=" + this._albumIdToUrlAlbumId(albumId) + "&";
      Application.activeWindow.open(
        this._url("http://www.facebook.com/editphoto.php?" + aid + "org=1")).focus();
        */

      if (document.getElementById("albumsList").selectedItem)
      {
          var link = document.getElementById("albumsList").selectedItem.getAttribute("link");

          if (link)
              Application.activeWindow.open(this._url(link)).focus();
      }

      window.close();
    }
  },

  _createAlbum: function() {
    var albumName = document.getElementById("albumName").value;
    if (!albumName) {
      // TODO: would be better to disable the Upload button in that case.
      alert("Album name shouldn't be empty");
      this._uploadComplete(UPLOAD_CANCELLED);
      return;
    }
    var albumLocation = document.getElementById("albumLocation").value;
    var albumDescription = document.getElementById("albumDescription").value;
    var albumVisibility = document.getElementById("albumVisibility")
                                  .selectedItem.value;

    var params = [
      "uid=" + gFacebookServiceUnwrapped.loggedInUser.id,
      "name=" + albumName,
      "visible=" + albumVisibility
    ];
    if (albumLocation)
      params.push("location=" + albumLocation);
    if (albumDescription)
      params.push("description=" + albumDescription);

    gFacebookService.callMethod('facebook.photos.createAlbum',
      params,
      function(data) {
        if (!data.aid) {
          fbLib.debug("Error while creating album");
          self._uploadComplete(UPLOAD_ERROR, null, "Error while creating album");
          return;
        }
        PhotoUpload._uploadToAlbum(data.aid)
      }
    );
  },

  /**
   * Starts the upload process. This is the public method that should be
   * called from the UI.
   */
  upload: function() {
    if (PhotoSet.photos.length == 0) {
      // This shouldn't happen (button is disabled when there are no photos).
      return;
    }
    // TODO: store albumId in a field instead of passing it around.

    this._uploadStatusBox.removeAttribute("collapsed");
    this._uploadStatusDeck.selectedIndex = 1;
    this._uploadBroadcaster.setAttribute("disabled", "true");
    this._uploadStatus.className = "upload-status";
    this._uploadStatus.value = "";

      var albumsList = document.getElementById("albumsList");
      if (!albumsList.selectedItem) {
          this._uploadComplete(UPLOAD_ERROR, null, "Unexpected state");
        return;
      }
      this._uploadToAlbum(albumsList.selectedItem.getAttribute("id"));
  },

  /**
   * Should be called when the upload is complete or cancelled in order to
   * restore the UI / show error messages / or open the album page.
   */
  _uploadComplete: function(status, albumId, errorMessage) {
    this._uploadCancelled = false;
    this._uploadProgress.value = 0;
    this._uploadBroadcaster.setAttribute("disabled", "false");
    this._uploadStatusBox.setAttribute("collapsed", "true");
    this._uploadStatusDeck.selectedIndex = 0;

    if (status == UPLOAD_CANCELLED) {
      this._uploadStatus.value = this._stringBundle.getString("uploadCancelled");
    } else if (status == UPLOAD_COMPLETE) {
      this._uploadStatus.value = this._stringBundle.getString("uploadComplete");
      this._showUploadCompleteNotification(albumId);
      this._maybeOpenAlbumPage(albumId);
    } else if (status == UPLOAD_ERROR) {
      alert(this._stringBundle.getString("uploadFailedAlert") + " " + errorMessage);
      this._uploadStatus.className += " error";
      this._uploadStatus.value = this._stringBundle.getString("uploadFailedStatus") +
                                 " " + errorMessage;
    } else {
      fbLib.debug("Unknown upload status: " + status);
    }
  },

  /**
   * Second phase of the upload process. This is called from upload() and is
   * in a separate method in order to be called asynchronously when creating
   * a new album
   */
  _uploadToAlbum: function(id) {
    if (this._uploadCancelled) {
      this._uploadComplete(UPLOAD_CANCELLED, id);
      return;
    }

    var self = this;
    PhotoSet.upload(id,
      function(percent) { // onProgress callback
        fbLib.debug("Got progress " + percent);
        self._uploadProgress.value = percent;
      }, function(cancelled) { // onComplete callback
        self._uploadComplete(cancelled ? UPLOAD_CANCELLED : UPLOAD_COMPLETE, id);
      }, function(message) { // onError callback
        self._uploadComplete(UPLOAD_ERROR, null, message);
    });
  },

  doOpenCreateNewAlbumDialog: function() {
    document.getElementById("albumsList").selectedIndex = 0;
    window.openDialog('chrome://facebook/content/photoupload/createnewalbumdialog.xul', 'facebook:createnewalbum', 'chrome,modal,centerscreen,titlebar,dialog=yes');
  }

};
