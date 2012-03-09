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

function sendLoadEvent() {
    var element = document.getElementById("bod");
    var evt = document.createEvent("Events");
    evt.initEvent("fbLoadEvent", true, false);
    element.dispatchEvent(evt);
}

function sendLikeEvent(aValue) {
    var element = document.getElementById("hidden");
    element.setAttribute("like", aValue);
    var evt = document.createEvent("Events");
    evt.initEvent("fbFirstrunEvent", true, false);
    element.dispatchEvent(evt);
}

function LikeOrNoLike(aButton) {
    var like = (aButton == 1) ? "true" : "false";
    sendLikeEvent(like);
}
