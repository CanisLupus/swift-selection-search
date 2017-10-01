"use strict";

const DEBUG = true;

// Subset of consts present in background script (avoids having to ask for them).
let consts = {
	PopupOpenBehaviour_Auto: "auto",

	PopupLocation_Selection: "selection",
	PopupLocation_Cursor: "cursor",

	AutoCopyToClipboard_Always: "always",

	ItemHoverBehaviour_Nothing: "nothing",
	ItemHoverBehaviour_Highlight: "highlight",
	ItemHoverBehaviour_HighlightAndMove: "highlight-move",
};

let popup = null;
let popupCss = null;
let selection = null;
let mousePositionX = 0;
let mousePositionY = 0;

// be prepared for messages from background (main) script
browser.runtime.onMessage.addListener(onMessageReceived);
browser.storage.onChanged.addListener(onSettingsChanged);

if (DEBUG) { browser.runtime.sendMessage({ type: "log", log: "content script has started!" }); }

requestActivation();

function requestActivation()
{
	// ask the main script to activate this worker
	browser.runtime.sendMessage({ type: "activationRequest" }).then(
		msg => activate(msg.popupLocation, msg.popupPanelOpenBehaviour),	// main script passes a few settings needed for setup
		getErrorHandler("Error sending activation message from worker.")
	);
}

function onMessageReceived(msg, sender, sendResponse)
{
	if (msg.type === "deactivate") {
		deactivate();
	} else if (msg.type === "showPopup") {
		onSelectionChange();
	} else if (msg.type === "copyToClipboard") {
		document.execCommand("copy");
	}
}

function onSettingsChanged(changes, area)
{
	if (area !== "local" || Object.keys(changes).length === 0) {
		return;
	}

	if (DEBUG) { browser.runtime.sendMessage({ type: "log", log: "onSettingsChanged" }); }

	deactivate();
	requestActivation();
}

function getErrorHandler(text)
{
	return error => browser.runtime.sendMessage({ type: "log", log: `${text} (${error})` });
}

function activate(popupLocation, popupPanelOpenBehaviour)
{
	// register with events based on user settings

	if (popupLocation === consts.PopupLocation_Cursor) {
		document.addEventListener("mousemove", onMouseUpdate);
		document.addEventListener("mouseenter", onMouseUpdate);
	}

	if (popupPanelOpenBehaviour === consts.PopupOpenBehaviour_Auto) {
		selectionchange.start();
		document.addEventListener("customselectionchange", onSelectionChange);
	}

	if (DEBUG) { browser.runtime.sendMessage({ type: "log", log: "worker activated" }); }
}

function deactivate()
{
	if (popup !== null) {
		// clean page
		document.documentElement.removeChild(popup);
		document.documentElement.removeChild(popupCss);
		popup = null;
	}

	// unregister with all events

	document.removeEventListener("mousemove", onMouseUpdate);
	document.removeEventListener("mouseenter", onMouseUpdate);
	document.documentElement.removeEventListener("keypress", hidePopup);
	document.documentElement.removeEventListener("mousedown", hidePopup);
	window.removeEventListener("scroll", hidePopup);
	// other listeners are destroyed along with their popup objects

	document.removeEventListener("customselectionchange", onSelectionChange);
	selectionchange.stop();

	if (DEBUG) { browser.runtime.sendMessage({ type: "log", log: "worker deactivated" }); }
}

function onSelectionChange()
{
	if (saveCurrentSelection() === null) {
		return;
	}

	browser.storage.local.get().then(
		settings => {
			if (settings.autoCopyToClipboard === consts.AutoCopyToClipboard_Always) {
				document.execCommand("copy");
			}

			if (DEBUG) { browser.runtime.sendMessage({ type: "log", log: "showing popup: " + popup }); }

			// if panel already exists, show, otherwise create (and show)
			if (popup !== null) {
				showPopup(settings, settings.searchEngines);
			} else {
				createPopup(settings, settings.searchEngines);
			}
		},
		getErrorHandler("Error getting settings after onSelectionChange."));
}

function saveCurrentSelection()
{
	selection = window.getSelection();

	// exit if there's no text selected after all
	if (selection === null || selection.toString().length === 0) {
		return null;
	}

	// don't show popup in contentEditable elements, such as Gmail's compose window
	for (let elem = selection.anchorNode; elem !== document; elem = elem.parentNode)
	{
		if (elem.isContentEditable === undefined) {
			continue;	// check parent for value
		} else if (elem.isContentEditable) {
			return null;		// quit
		} else /*if (!elem.isContentEditable)*/ {
			break;		// create popup
		}
	}

	return selection;
}

function showPopup(settings, searchEngines)
{
	if (popup !== null) {
		popup.style.display = "inline-block";
		setPopupPositionAndSize(popup, searchEngines.length, settings);
	}
}

function hidePopup()
{
	if (popup !== null) {
		popup.style.display = "none";
	}
}

function createPopup(settings, searchEngines)
{
	// create popup parent (will contain all icons)
	popup = document.createElement("swift-selection-search-engines");
	popup.style.paddingTop = popup.style.paddingBottom = settings.popupPaddingY + "px";
	popup.style.paddingLeft = popup.style.paddingRight = settings.popupPaddingX + "px";

	setPopupPositionAndSize(popup, searchEngines.length, settings);

	switch (settings.itemHoverBehaviour) {
		case consts.ItemHoverBehaviour_Nothing:          popup.className = "hover-nothing"; break;
		case consts.ItemHoverBehaviour_Highlight:        popup.className = "hover-highlight-only"; break;
		case consts.ItemHoverBehaviour_HighlightAndMove: popup.className = "hover-highlight-and-move"; break;
		default: break;
	}

	// create all engine icons

	let sssIconPaths = {
		copyToClipboard: "data/icons/sss-icon-copy.svg",
		openAsLink: "data/icons/sss-icon-open-link.svg",
	};

	let padding = settings.itemPadding + "px";
	let size = settings.itemSize + "px";

	for (let i = 0; i < searchEngines.length; i++)
	{
		let engine = searchEngines[i];

		let iconSrc;
		if (engine.type === "sss") {
			// icon paths should not be hardcoded here, but getting them from bg script is cumbersome
			if (engine.id === "copyToClipboard") {
				iconSrc = browser.extension.getURL("data/icons/sss-icon-copy.svg");
			} else if (engine.id === "openAsLink") {
				iconSrc = browser.extension.getURL("data/icons/sss-icon-open-link.svg");
			}
		} else {
			iconSrc = engine.iconSrc;
		}

		let icon = document.createElement("img");
		icon.setAttribute("src", iconSrc);
		icon.title = engine.name;
		icon.style.height = size;
		icon.style.width = size;
		icon.style.paddingLeft = padding;
		icon.style.paddingRight = padding;

		icon.addEventListener("mouseup", onSearchEngineClick(engine, settings));
		icon.addEventListener("mousedown", function(e) {
			if (e.which === 2) {
				e.preventDefault();
			}
		});
		icon.ondragstart = function() { return false; };	// disable dragging popup images

		popup.appendChild(icon);
	}

	// add popup element and respective css formatting to page
	document.documentElement.appendChild(popup);
	popupCss = getPopupStyle(settings);
	document.documentElement.appendChild(popupCss);

	document.documentElement.addEventListener("keypress", hidePopup);
	document.documentElement.addEventListener("mousedown", hidePopup);	// hide popup from a press down anywhere...
	popup.addEventListener("mousedown", e => e.stopPropagation());	// ...except on the popup itself

	if (settings.hidePopupPanelOnPageScroll) {
		window.addEventListener("scroll", hidePopup);
	}
}

function setPopupPositionAndSize(popup, nEngines, settings)
{
	let itemHeight = settings.itemSize + 8;
	let itemWidth = settings.itemSize + settings.itemPadding * 2;
	if (DEBUG) { browser.runtime.sendMessage({ type: "log", log: "itemHeight: " + itemHeight }); }
	if (DEBUG) { browser.runtime.sendMessage({ type: "log", log: "itemWidth: " + itemWidth }); }

	let nItemsPerRow = nEngines;
	if (!settings.useSingleRow && settings.nItemsPerRow < nItemsPerRow) {
		nItemsPerRow = settings.nItemsPerRow > 0 ? settings.nItemsPerRow : 1;
	}
	let height = itemHeight * Math.ceil(nEngines / nItemsPerRow) + settings.popupPaddingY * 2;
	let width = itemWidth * nItemsPerRow + settings.popupPaddingX * 2;

	if (DEBUG) { browser.runtime.sendMessage({ type: "log", log: "height: " + height }); }
	if (DEBUG) { browser.runtime.sendMessage({ type: "log", log: "width: " + width }); }

	let positionLeft;
	let positionTop;

	if (settings.popupLocation === consts.PopupLocation_Selection) {
		let range = selection.getRangeAt(0); // get the text range
		let rect = range.getBoundingClientRect();
		positionLeft = rect.right + window.pageXOffset;
		positionTop = rect.bottom + window.pageYOffset;
	} else if (settings.popupLocation === consts.PopupLocation_Cursor) {
		positionLeft = mousePositionX;
		positionTop = mousePositionY - height - 10;	// 10 is forced padding to avoid popup being too close to cursor
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

function onMouseUpdate(e)
{
	mousePositionX = e.pageX;
	mousePositionY = e.pageY;
}

function onSearchEngineClick(engineObject, settings)
{
	return function(ev) {
		if (settings.hidePopupPanelOnSearch) {
			hidePopup();
		}

		if (ev.which === 1 || ev.which === 2)
		{
			let message = {
				type: "engineClick",
				selection: selection.toString(),
				engine: engineObject,
			};

			if (ev.ctrlKey) {
				message.clickType = "ctrlClick";
			} else if (ev.which === 1) {
				message.clickType = "leftClick";
			} else /*if (e.which === 2)*/ {
				message.clickType = "middleClick";
			}

			browser.runtime.sendMessage(message);
		}
	};
}

function getPopupStyle(settings)
{
	let css = document.createElement("style");
	css.type = "text/css";
	css.textContent =
`swift-selection-search-engines,
swift-selection-search-engines *,
swift-selection-search-engines a:hover,
swift-selection-search-engines a:visited,
swift-selection-search-engines a:active {
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

swift-selection-search-engines {
	position: absolute;
	z-index: 2147483647;
	padding: 2px;
	margin: 0px;
	text-align: center;
	pointer-events: none;
	overflow: hidden;
	display: inline-block;
	background-color: ${settings.popupPanelBackgroundColor};
	box-shadow: 0px 0px 3px rgba(0,0,0,.5);
	border-radius: 2px;
}

swift-selection-search-engines img {
	padding: 4px 2px;
	cursor: pointer;
	vertical-align: top;
	pointer-events: auto;
}

swift-selection-search-engines.hover-nothing img:hover {
}

swift-selection-search-engines.hover-highlight-only img:hover {
	border-bottom: 2px ${settings.popupPanelHighlightColor} solid;
	border-radius: 2px;
	padding-bottom: 2px;
}

swift-selection-search-engines.hover-highlight-and-move img:hover {
	border-bottom: 2px ${settings.popupPanelHighlightColor} solid;
	border-radius: 2px;
	padding-top: 1px;
}
${getPopupCssAnimation(settings.popupPanelAnimationDuration)}`;

	return css;
}

function getPopupCssAnimation(duration)
{
	if (duration > 0) {
		duration = duration / 1000.0;
		return(
`swift-selection-search-engines {
	animation: fadein ${duration}s;
	animation: pop ${duration}s;
}

@keyframes fadein {
	from { opacity: 0; }
	to   { opacity: 1; }
}

@keyframes pop {
	0%   { transform: scale(0.8); }
	100% { transform: scale(1); }
}`);
	} else {
		return "";
	}
}
