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

const Cc = Components.classes;
const Ci = Components.interfaces;
const CC = Components.Constructor;
const Cu = Components.utils;

// JavaScript semantics is required for some member access, that's why
// we use wrappedJSObject instead of going throught the .idl.
var gFacebookService =  Cc['@facebook.com/facebook-service;1'].
                        getService(Ci.fbIFacebookService).
                        wrappedJSObject;
// Unwrapped version.
var gFacebookServiceUnwrapped =  Cc['@facebook.com/facebook-service;1'].
                                 getService(Ci.fbIFacebookService);
 
var CreateNewAlbumDialog = {

    invalidate: function() {
        document.getElementById("createNewAlbumDialog").getButton("accept").disabled = (document.getElementById("name").value == "");
    },

    doOK: function() {
        CreateNewAlbumDialog._createAlbum(
            document.getElementById("name").value,
            document.getElementById("description").value,
            document.getElementById("location").value,
            document.getElementById("visibility").selectedItem.value);

        return false;
    },

    _createAlbum: function(albumName, albumDescription, albumLocation, albumVisibility) {

        var params = {
            "name": albumName,
            "visible": albumVisibility,
            "location": albumLocation,
            "description": albumDescription
            };

        gFacebookService.postGraphObject("me/albums", params, function(response)
        {
            if (response.id)
            {
                window.opener.document.getElementById("albumsList").setAttribute("lastalbumid", response.id);
                window.opener.PhotoUpload._fillAlbumList(function() { window.close(); });
            }
            else
            {
                alert("Error while creating album.");
            }
        });
    }
};


