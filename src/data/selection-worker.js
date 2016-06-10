function onSelection()
{
	var s = window.getSelection();

	if (s == null || s.toString().length == 0) {
		return;
	}

	var range = s.getRangeAt(0); //get the text range
	var rect = range.getBoundingClientRect();

	self.port.emit("onAcquiredSelectionInfo", s.toString(), {left: rect.right, top: rect.bottom})
}

function registerOnPageScroll()
{
	window.addEventListener("scroll", onPageScroll);
}

function deregisterOnPageScroll()
{
	window.removeEventListener("scroll", onPageScroll);
}

function onPageScroll()
{
	self.port.emit("onPageScroll");
}

self.port.on('onSelection', onSelection);
self.port.on('registerOnPageScroll', registerOnPageScroll);
self.port.on('deregisterOnPageScroll', deregisterOnPageScroll);
