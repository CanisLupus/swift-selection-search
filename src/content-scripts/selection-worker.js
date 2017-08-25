"use strict";

// browser.runtime.sendMessage({ type: "log", log: "content script!" });

browser.runtime.onMessage.addListener(onMessageReceived);

function onMessageReceived(msg, sender, sendResponse)
{
	if (msg.type == "activate") {
		activate(msg.settings, msg.engineObjects);
	} else if (msg.type == "deactivate") {
		deactivate();
	} else if (msg.type == "showPopup") {
		showPopup(msg.settings, msg.engineObjects);
	}
	// browser.runtime.onMessage.removeListener(onMessageReceived);
}

var consts = {
	PopupOpenBehaviour_Auto: "1",

	PopupLocation_Selection: "0",
	PopupLocation_Cursor: "1",

	AutoCopyToClipboard_Always: "1",

	ItemHoverBehaviour_Nothing: "0",
	ItemHoverBehaviour_Highlight: "1",
	ItemHoverBehaviour_HighlightAndMove: "2",
};

var globalSettings = null;
var globalEngineObjects = null;

var popup = null;
var selection = null;
var popupCss = null;

var mousePositionX = 0;
var mousePositionY = 0;

browser.runtime.sendMessage({ type: "log", log: "content script has started!" });

browser.runtime.sendMessage({ type: "activation" }).then(handleResponse, getErrorHandler("Error sending activation message from worker."));

function handleResponse(msg)
{
	activate(msg.settings, msg.engineObjects);
}

function getErrorHandler(text)
{
	return error => browser.runtime.sendMessage({ type: "log", log: `${text} (${error})` });
}

function activate(_settings, _engineObjects)
{
	globalSettings = _settings;
	globalEngineObjects = _engineObjects;

	browser.runtime.sendMessage({ type: "log", log: "activate content script" });
	browser.runtime.sendMessage({ type: "log", log: _settings });

	if (globalSettings.popupLocation === consts.PopupLocation_Cursor) {
		document.addEventListener("mousemove", onMouseUpdate);
		document.addEventListener("mouseenter", onMouseUpdate);
	}

	if (globalSettings.popupPanelOpenBehaviour === consts.PopupOpenBehaviour_Auto) {
		selectionchange.start();
		document.addEventListener("customselectionchange", onSelectionChange);
	}
}

function deactivate()
{
	if (popup != null) {
		document.documentElement.removeChild(popup);
		document.documentElement.removeChild(popupCss);
		popup = null;
	}

	document.removeEventListener("mousemove", onMouseUpdate);
	document.removeEventListener("mouseenter", onMouseUpdate);
	document.documentElement.removeEventListener("keypress", hidePopup);
	document.documentElement.removeEventListener("mousedown", hidePopup);
	window.removeEventListener("scroll", onPageScroll);
	// other listeners are destroyed along with the popup objects

	document.removeEventListener("customselectionchange", onSelectionChange);
	// selectionchange.stop();
}

function onSelectionChange()
{
	showPopupForSelectedText(globalSettings, globalEngineObjects);
}

function showPopupForSelectedText(settings, engineObjects)
{
	let s = window.getSelection();

	if (s == null || s.toString().length == 0) {
		return;
	}

	// disable popup in contentEditable elements, such as Gmail's compose window
	for (let elem = s.anchorNode; elem !== document; elem = elem.parentNode)
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

	if (settings.autoCopyToClipboard === consts.AutoCopyToClipboard_Always) {
		document.execCommand("Copy");
	}

	if (popup != null) {
		showPopup(settings, engineObjects);
	} else {
		createPopup(settings, engineObjects);
	}
}

function createPopup(settings, engineObjects)
{
	// destroy old popup, if any
	if (popup != null) {
		deactivate();
	}

	popup = document.createElement("engines");
	popup.id = "swift-selection-search-engines";
	popup.style.paddingTop = settings.popupPaddingY + "px";
	popup.style.paddingBottom = settings.popupPaddingY + "px";
	popup.style.paddingLeft = settings.popupPaddingX + "px";
	popup.style.paddingRight = settings.popupPaddingX + "px";

	setPopupPositionAndSize(popup, selection, engineObjects, settings);

	switch (settings.itemHoverBehaviour) {
		case consts.ItemHoverBehaviour_Nothing:          popup.className = "hover-nothing"; break;
		case consts.ItemHoverBehaviour_Highlight:        popup.className = "hover-highlight-only"; break;
		case consts.ItemHoverBehaviour_HighlightAndMove: popup.className = "hover-highlight-and-move"; break;
		default: break;
	}

	document.documentElement.appendChild(popup);

	let padding = settings.itemPadding + "px";
	let size = settings.itemSize + "px";

	for (let i = 0; i < engineObjects.length; i++) {
		let icon = addEngineToLayout(engineObjects[i], popup);
		icon.style.height = size;
		icon.style.width = size;
		icon.style.paddingLeft = padding;
		icon.style.paddingRight = padding;
	}

	popupCss = getPopupStyle();
	document.documentElement.appendChild(popupCss);

	document.documentElement.addEventListener("keypress", hidePopup);
	document.documentElement.addEventListener("mousedown", hidePopup);	// hide popup from a press down anywhere...
	popup.addEventListener("mousedown", stopEventPropagation);	// ...except on the popup itself

	if (settings.hidePopupPanelOnPageScroll) {
		window.addEventListener("scroll", onPageScroll);
	}
}

function setPopupPositionAndSize(popup, selection, engineObjects, settings)
{
	let itemHeight = settings.itemSize + 8;
	let itemWidth = settings.itemSize + settings.itemPadding * 2;

	let nItemsPerRow = engineObjects.length;
	if (!settings.useSingleRow && settings.nItemsPerRow < nItemsPerRow) {
		nItemsPerRow = settings.nItemsPerRow;
	}
	let height = itemHeight * Math.ceil(engineObjects.length / nItemsPerRow) + settings.popupPaddingY * 2;
	let width = itemWidth * nItemsPerRow + settings.popupPaddingX * 2;

	let range = selection.getRangeAt(0); // get the text range
	let rect = range.getBoundingClientRect();

	let positionLeft;
	let positionTop;

	if (settings.popupLocation === consts.PopupLocation_Selection) {
		positionLeft = rect.right + window.pageXOffset;
		positionTop = rect.bottom + window.pageYOffset;
	} else if (settings.popupLocation === consts.PopupLocation_Cursor) {
		positionLeft = mousePositionX;
		positionTop = mousePositionY - height;
	}

	// center horizontally
	positionLeft -= width / 2;

	let popupOffsetX = settings.popupOffsetX;
	if (settings.negatePopupOffsetX) {
		popupOffsetX = -popupOffsetX;
	}
	let popupOffsetY = settings.popupOffsetY;
	if (settings.negatePopupOffsetY) {
		popupOffsetY = -popupOffsetY;
	}

	positionLeft += popupOffsetX;
	positionTop -= popupOffsetY;	// invert sign because y is 0 at the top

	let pageWidth = document.documentElement.offsetWidth + window.pageXOffset;
	let pageHeight = document.documentElement.scrollHeight;

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
	let css = document.createElement("style");
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
	background-color: `+globalSettings.popupPanelBackgroundColor+`;
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
	border-bottom: 2px `+globalSettings.popupPanelHighlightColor+` solid;
	border-radius: 2px;
	padding-bottom: 2px;
}

#swift-selection-search-engines.hover-highlight-and-move img:hover {
	border-bottom: 2px `+globalSettings.popupPanelHighlightColor+` solid;
	border-radius: 2px;
	padding-top: 1px;
}`;

	if (globalSettings.popupPanelAnimationDuration > 0) {
		let duration = globalSettings.popupPanelAnimationDuration / 1000.0;
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

function addEngineToLayout(engineObject, popup)
{
	let icon = document.createElement("img");
	icon.setAttribute("src", engineObject.iconUrl);
	icon.addEventListener("mouseup", onSearchEngineClick(engineObject));
	icon.addEventListener("mousedown", function(e) {
		if (e.which == 2) {
			e.preventDefault();
		}
	});
	icon.title = engineObject.name;
	icon.ondragstart = function() { return false; };	// disable dragging popup images
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

function showPopup(settings, engineObjects)
{
	if (popup != null) {
		popup.style.display = "inline-block";
		setPopupPositionAndSize(popup, selection, engineObjects, settings);
	}
}

function onMouseUpdate(e)
{
	mousePositionX = e.pageX;
	mousePositionY = e.pageY;
}

function onSearchEngineClick(engineObject)
{
	return function(e) {
		if (globalSettings.hidePopupPanelOnSearch) {
			hidePopup();
		}

		if (e.which === 1 || e.which === 2)
		{
			let message = {
				type: "engineClick",
				selection: selection.toString(),
				engine: engineObject,
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
