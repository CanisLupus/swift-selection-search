self.on("click", function(node) {
	// get current selection
	var txt = window.getSelection().toString();
	if (!txt) {
		// if it failed (forms, for example), try to get text from active element
		var elem = document.activeElement;
		txt = elem.value.substring(elem.selectionStart, elem.selectionEnd);
	}
	if (txt) {
		self.postMessage(txt);
	}
});
