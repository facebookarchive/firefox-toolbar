var facebook={
  get_current_document: function() {
    return document.getElementById('content').selectedBrowser.contentWindow.document;
  },

  go_url: function(url) {
    this.get_current_document().location.href=url;
  }
}