browser.runtime.onMessage.addListener(onMessageReceived);

function onMessageReceived(msg, sender, sendResponse) {
	if (msg.type == 'activate') {
		activate(msg.settings, msg.engineObjs);
	} else if (msg.type == 'deactivate') {
		deactivate();
	} else if (msg.type == 'showPopup') {
		showPopup(msg.settings, msg.engineObjs);
	}
	// browser.runtime.onMessage.removeListener(onMessageReceived);
}

var AutoCopyToClipboard_Always = "1";

popup = null;
selection = null;
popupEngineObjs = null;
popupSettings = null;
popupCss = null;

mousePositionX = 0;
mousePositionY = 0;

browser.runtime.sendMessage({ type: "log", log: "content script has started!" });

var sending = browser.runtime.sendMessage({ type: "activation" });
sending.then(handleResponse, handleError);

function handleResponse(msg) {
	activate(msg.settings, msg.engineObjs);
}

function handleError(error) {
	browser.runtime.sendMessage({ type: "log", log: `Error: ${error}` });
}

function activate(settings, engineObjs)
{
	browser.runtime.sendMessage({ type: "log", log: "activate content script" });
	popupSettings = settings;
	popupEngineObjs = engineObjs;

	if (settings.popupLocation === "1") {	// option "At cursor location"
		document.addEventListener('mousemove', onMouseUpdate);
		document.addEventListener('mouseenter', onMouseUpdate);
	}

	if (settings.popupPanelOpenBehaviour === "1") {	// option "Auto"
		selectionchange.start();
		document.addEventListener('customselectionchange', onselectionchange);
	}
}

function deactivate()
{
	if (popup != null) {
		document.documentElement.removeChild(popup);
		document.documentElement.removeChild(popupCss);
		popup = null;
	}

	document.removeEventListener('mousemove', onMouseUpdate);
	document.removeEventListener('mouseenter', onMouseUpdate);
	document.documentElement.removeEventListener('keypress', hidePopup);
	document.documentElement.removeEventListener('mousedown', hidePopup);
	window.removeEventListener("scroll", onPageScroll);
	// other listeners are destroyed along with the popup objects

	document.removeEventListener('customselectionchange', onselectionchange);
	// selectionchange.stop();
}

function onselectionchange()
{
	showPopupForSelectedText(popupSettings, popupEngineObjs);
}

function showPopupForSelectedText(settings, engineObjs)
{
	var s = window.getSelection();

	if (s == null || s.toString().length == 0) {
		return;
	}

	// disable popup in contentEditable elements, such as Gmail's compose window
	for (var elem = s.anchorNode; elem !== document; elem = elem.parentNode)
	{
		if (elem.isContentEditable === undefined) {
			continue;	// check parent for value
		} else if (elem.isContentEditable === true) {
			return;		// quit
		} else /*if (elem.isContentEditable === false)*/ {
			break;		// create popup
		}
	}

	selection = s;
	// browser.runtime.sendMessage({ type: "log", log: "showPopupForSelectedText " + selection.toString() });

	if (settings.autoCopyToClipboard === AutoCopyToClipboard_Always) {
		document.execCommand("Copy");
	}

	if (popup != null) {
		showPopup(settings, engineObjs);
	} else {
		createPopup(settings, engineObjs);
	}
}

function createPopup(settings, engineObjs)
{
	// destroy old popup, if any
	if (popup != null) {
		deactivate();
	}

	popup = document.createElement('engines');
	popup.id = "swift-selection-search-engines";
	popup.style.paddingTop = settings.popupPaddingY + "px";
	popup.style.paddingBottom = settings.popupPaddingY + "px";
	popup.style.paddingLeft = settings.popupPaddingX + "px";
	popup.style.paddingRight = settings.popupPaddingX + "px";

	setPopupPositionAndSize(popup, selection, engineObjs, settings);

	switch (settings.itemHoverBehaviour) {
		case "0": popup.className = "hover-nothing"; break;
		case "1": popup.className = "hover-highlight-only"; break;
		case "2": popup.className = "hover-highlight-and-move"; break;
		default: break;
	}

	document.documentElement.appendChild(popup);

	var padding = settings.itemPadding + "px";
	var size = settings.itemSize + "px";

	for (var i = 0; i < engineObjs.length; i++) {
		var icon = addEngineToLayout(engineObjs[i], popup);
		icon.style.height = size;
		icon.style.width = size;
		icon.style.paddingLeft = padding;
		icon.style.paddingRight = padding;
	}

	popupCss = getPopupStyle();
	document.documentElement.appendChild(popupCss);

	document.documentElement.addEventListener('keypress', hidePopup);
	document.documentElement.addEventListener('mousedown', hidePopup);	// hide popup from a press down anywhere...
	popup.addEventListener('mousedown', stopEventPropagation);	// ...except on the popup itself

	if (popupSettings.hidePopupPanelOnPageScroll) {
		window.addEventListener("scroll", onPageScroll);
	}
}

function setPopupPositionAndSize(popup, selection, engineObjs, settings)
{
	var itemHeight = settings.itemSize + 8;
	var itemWidth = settings.itemSize + settings.itemPadding * 2;

	var nItemsPerRow = engineObjs.length;
	if (!settings.useSingleRow && settings.nItemsPerRow < nItemsPerRow) {
		nItemsPerRow = settings.nItemsPerRow;
	}
	var height = itemHeight * Math.ceil(engineObjs.length / nItemsPerRow) + settings.popupPaddingY * 2;
	var width = itemWidth * nItemsPerRow + settings.popupPaddingX * 2;

	var range = selection.getRangeAt(0); // get the text range
	var rect = range.getBoundingClientRect();

	var positionLeft;
	var positionTop;

	if (settings.popupLocation === "1") {	// option "At cursor location"
		positionLeft = mousePositionX;
		positionTop = mousePositionY - height;
	} else /*if (options.popupLocation === "0") {*/ {
		positionLeft = rect.right + window.pageXOffset;
		positionTop = rect.bottom + window.pageYOffset;
	}

	// center horizontally
	positionLeft -= width / 2;

	var popupOffsetX = settings.popupOffsetX;
	if (settings.negatePopupOffsetX) {
		popupOffsetX = -popupOffsetX;
	}
	var popupOffsetY = settings.popupOffsetY;
	if (settings.negatePopupOffsetY) {
		popupOffsetY = -popupOffsetY;
	}

	positionLeft += popupOffsetX;
	positionTop -= popupOffsetY;	// invert sign because y is 0 at the top

	var pageWidth = document.documentElement.offsetWidth + window.pageXOffset;
	var pageHeight = document.documentElement.scrollHeight;

	// don't leave the page
	if (positionLeft < 5) {
		positionLeft = 5;
	} else if (positionLeft + width + 10 > pageWidth) {
		positionLeft = pageWidth - width - 10;
	}

	if (positionTop < 5) {
		positionTop = 5;
	} else if (positionTop + height + 10 > pageHeight) {
		positionTop = pageHeight - height - 10;
	}

	// set values
	popup.style.width = width + "px";
	popup.style.height = height + "px";
	popup.style.left = positionLeft + "px";
	popup.style.top = positionTop + "px";
}

function getPopupStyle()
{
	var css = document.createElement("style");
	css.type = "text/css";
	css.textContent =
`#swift-selection-search-engines,
#swift-selection-search-engines *,
#swift-selection-search-engines a:hover,
#swift-selection-search-engines a:visited,
#swift-selection-search-engines a:active {
	background:none;
	border:none;
	border-radius:0;
	bottom:auto;
	box-sizing: content-box;
	clear:none;
	cursor:default;
	display:inline;
	float:none;
	font-family:Arial, Helvetica, sans-serif;
	font-size:medium;
	font-style:normal;
	font-weight:normal;
	height:auto;
	left:auto;
	letter-spacing:normal;
	line-height:normal;
	max-height:none;
	max-width:none;
	min-height:0;
	min-width:0;
	overflow:visible;
	position:static;
	right:auto;
	text-align:left;
	text-decoration:none;
	text-indent:0;
	text-transform:none;
	top:auto;
	visibility:visible;
	white-space:normal;
	width:auto;
	z-index:auto;
}

#swift-selection-search-engines {
	position: absolute;
	z-index: 2147483647;
	padding: 2px;
	margin: 0px;
	text-align: center;
	pointer-events: none;
	overflow: hidden;
	display: inline-block;
	background-color: `+popupSettings.popupPanelBackgroundColor+`;
	box-shadow: 0px 0px 3px rgba(0,0,0,.5);
	border-radius: 2px;
}

#swift-selection-search-engines img {
	padding: 4px 2px;
	cursor: pointer;
	vertical-align: top;
	pointer-events: auto;
}

#swift-selection-search-engines.hover-nothing img:hover {
}

#swift-selection-search-engines.hover-highlight-only img:hover {
	border-bottom: 2px `+popupSettings.popupPanelHighlightColor+` solid;
	border-radius: 2px;
	padding-bottom: 2px;
}

#swift-selection-search-engines.hover-highlight-and-move img:hover {
	border-bottom: 2px `+popupSettings.popupPanelHighlightColor+` solid;
	border-radius: 2px;
	padding-top: 1px;
}`;

	if (popupSettings.popupPanelAnimationDuration > 0) {
		var duration = popupSettings.popupPanelAnimationDuration / 1000.0;
		css.textContent +=
`#swift-selection-search-engines {
	animation: fadein `+duration+`s;
	animation: pop `+duration+`s;
}

@keyframes fadein {
	from { opacity: 0; }
	to   { opacity: 1; }
}

@keyframes pop {
	0%   { transform: scale(0.8); }
	100% { transform: scale(1); }
}`;
	}

	return css;
}

function addEngineToLayout(engineObj, popup)
{
	var icon = document.createElement("img");
	icon.setAttribute("src", engineObj.iconSpec);
	icon.addEventListener("mouseup", onSearchEngineClick(engineObj));
	icon.addEventListener("mousedown", function(e) {
		if (e.which == 2) {
			e.preventDefault();
		}
	});
	icon.title = engineObj.name;
	popup.appendChild(icon);
	return icon;
}

function onPageScroll()
{
	if (popup != null) {
		hidePopup();
	}
}

function stopEventPropagation(e)
{
	e.stopPropagation();
}

function hidePopup()
{
	if (popup != null) {
		popup.style.display = "none";
	}
}

function showPopup(settings, engineObjs)
{
	if (popup != null) {
		popup.style.display = "inline-block";
		setPopupPositionAndSize(popup, selection, engineObjs, settings);
	}
}

function onMouseUpdate(e)
{
	mousePositionX = e.pageX;
	mousePositionY = e.pageY;
}

function onSearchEngineClick(engineObj)
{
	return function(e) {
		if (popupSettings.hidePopupPanelOnSearch) {
			hidePopup();
		}

		if (e.which === 1 || e.which === 2)
		{
			var message = {
				type: "engineClick",
				selection: selection.toString(),
				engine: engineObj,
			};

			if (e.ctrlKey) {
				message["clickType"] = "ctrlClick";
			} else if (e.which === 1) {
				message["clickType"] = "leftClick";
			} else /*if (e.which == 2)*/ {
				message["clickType"] = "middleClick";
			}

			browser.runtime.sendMessage(message);
		}
	}
}
