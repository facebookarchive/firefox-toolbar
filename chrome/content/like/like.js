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
