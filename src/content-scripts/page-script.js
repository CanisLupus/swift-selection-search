"use strict";

if (DEBUG) {
	var log = msg => browser.runtime.sendMessage({ type: "log", log: msg });
}

// Subset of consts present in background script (avoids having to ask for them).
const consts = {
	PopupOpenBehaviour_Auto: "auto",
	PopupOpenBehaviour_HoldAlt: "hold-alt",
	PopupOpenBehaviour_MiddleMouse: "middle-mouse",

	PopupLocation_Selection: "selection",
	PopupLocation_Cursor: "cursor",

	AutoCopyToClipboard_Always: "always",

	ItemHoverBehaviour_Nothing: "nothing",
	ItemHoverBehaviour_Highlight: "highlight",
	ItemHoverBehaviour_HighlightAndMove: "highlight-and-move",
};

let popup = null;
let selection = {};
let mousePositionX = 0;
let mousePositionY = 0;
let canMiddleClickEngine = true;
let activationSettings = null;
let settings = null;

// be prepared for messages from background (main) script
browser.runtime.onMessage.addListener(onMessageReceived);
browser.storage.onChanged.addListener(onSettingsChanged);

if (DEBUG) { log("content script has started!"); }

requestActivation();

function requestActivation()
{
	// ask the main script to activate this content script
	browser.runtime.sendMessage({ type: "getActivationSettings" }).then(
		activationSettings => activate(activationSettings),	// main script passes a few settings needed for setup
		getErrorHandler("Error sending getActivationSettings message from content script.")
	);
}

function onMessageReceived(msg, sender, callbackFunc)
{
	switch (msg.type)
	{
		case "isAlive":
			callbackFunc(true);
			break;

		case "showPopup":
			onSelectionChange(null, true);
			break;

		case "copyToClipboard":
			document.execCommand("copy");
			break;

		default: break;
	}
}

function onSettingsChanged(changes, area)
{
	if (area !== "local" || isObjectEmpty(changes)) {
		return;
	}

	if (DEBUG) { log("onSettingsChanged"); }

	// restart content script
	deactivate();
	requestActivation();
}

function isObjectEmpty(object)
{
	for (const key in object) {
		return false;	// has at least one element
	}
	return true;
}

function getErrorHandler(text)
{
	if (DEBUG) {
		return error => { log(`${text} (${error})`); };
	} else {
		return undefined;
	}
}

function activate(_activationSettings)
{
	activationSettings = _activationSettings;

	// register with events based on user settings

	if (activationSettings.popupLocation === consts.PopupLocation_Cursor) {
		document.addEventListener("mousemove", onMouseUpdate);
		document.addEventListener("mouseenter", onMouseUpdate);
	}

	if (activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_Auto || activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_HoldAlt) {
		selectionchange.start();
		document.addEventListener("customselectionchange", onSelectionChange);
	}
	else if (activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_MiddleMouse) {
		document.addEventListener("mousedown", onMouseDown);
		document.addEventListener("mouseup", onMouseUp);
	}

	if (DEBUG) { log("content script activated, url: " + window.location.href.substr(0, 40)); }
}

function deactivate()
{
	if (activationSettings === null) {
		return;
	}

	// unregister with all events

	if (activationSettings.popupLocation === consts.PopupLocation_Cursor) {
		document.removeEventListener("mousemove", onMouseUpdate);
		document.removeEventListener("mouseenter", onMouseUpdate);
	}

	if (activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_Auto || activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_HoldAlt) {
		document.removeEventListener("customselectionchange", onSelectionChange);
		selectionchange.stop();
	}
	else if (activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_MiddleMouse) {
		document.removeEventListener("mousedown", onMouseDown);
		document.removeEventListener("mouseup", onMouseUp);
	}

	if (popup !== null)
	{
		document.documentElement.removeEventListener("keypress", hidePopup);
		document.documentElement.removeEventListener("mousedown", hidePopup);
		if (settings.hidePopupOnPageScroll) {
			window.removeEventListener("scroll", hidePopup);
		}

		// clean page
		document.documentElement.removeChild(popup);
		popup = null;
	}

	activationSettings = null;
	settings = null;

	// other listeners are destroyed along with their popup objects

	if (DEBUG) { log("content script deactivated"); }
}

function onSelectionChange(ev, isForced)
{
	if (!saveCurrentSelection()) {
		return;
	}

	if (settings !== null) {
		// if we have settings already, use them...
		tryShowPopup(ev, isForced);
	} else {
		// ...otherwise ask the main script for all needed settings, store them, and try to show the popup
		browser.runtime.sendMessage({ type: "getPopupSettings" }).then(
			popupSettings => {
				settings = popupSettings;
				tryShowPopup(ev, isForced);
			},
			getErrorHandler("Error sending getPopupSettings message from content script.")
		);
	}
}

function saveCurrentSelection()
{
	let elem = document.activeElement;

	selection.isInEditableField = (elem.tagName === "TEXTAREA" || (elem.tagName === "INPUT" && elem.type !== "password"));

	if (selection.isInEditableField) {
		selection.text = elem.value.substring(elem.selectionStart, elem.selectionEnd);
		selection.element = elem;
	} else {
		// get selection, but exit if there's no text selected after all
		let selectionObject = window.getSelection();
		if (selectionObject === null) {
			return false;
		}
		selection.text = selectionObject.toString();
		selection.selection = selectionObject;
	}

	return selection.text.length > 0;
}

function tryShowPopup(ev, isForced)
{
	if (settings.popupOpenBehaviour === consts.PopupOpenBehaviour_HoldAlt && !ev.altKey) {
		return;
	}

	if (settings.popupOpenBehaviour === consts.PopupOpenBehaviour_Auto && selection.text.trim().length < settings.minSelectedCharacters) {
		return;
	}

	if (!isForced && !settings.allowPopupOnEditableFields)
	{
		if (selection.isInEditableField) {
			return;
		}

		// even if this is not an input field, don't show popup in contentEditable elements, such as Gmail's compose window
		for (let elem = selection.selection.anchorNode; elem !== document; elem = elem.parentNode)
		{
			if (elem.isContentEditable === undefined) {
				continue;	// check parent for value
			} else if (elem.isContentEditable) {
				return;		// quit
			} else {
				break;		// show popup
			}
		}
	}

	if (settings.autoCopyToClipboard === consts.AutoCopyToClipboard_Always) {
		document.execCommand("copy");
	}

	if (DEBUG) { log("showing popup, previous value was: " + popup); }

	if (popup === null) {
		createPopup(settings);
	}

	showPopup(settings);
}

function showPopup(settings)
{
	if (popup !== null)
	{
		popup.style.display = "inline-block";
		setPopupPositionAndSize(popup, settings.searchEngines.length, settings);

		if (settings.popupAnimationDuration > 0) {
			// cloneInto fixes a Firefox bug that causes animations to not work in the settings page
			popup.animate(cloneInto({ transform: ["scale(0.8)", "scale(1)"] }, window), settings.popupAnimationDuration);
			popup.animate(cloneInto({ opacity: [0, 1] }, window), settings.popupAnimationDuration * 0.5);
		}
	}
}

function hidePopup(ev)
{
	if (popup === null) {
		return;
	}

	if (settings && settings.hidePopupOnRightClick === false && ev && ev.button === 2) {
		return;
	}

	popup.style.display = "none";
}

function createPopup(settings)
{
	// create popup parent (will contain all icons)
	popup = document.createElement("swift-selection-search-popup");

	// format popup, resetting all to initial and including values that will be changed later (set those to "initial" explicitly)
	let popupCssText =
`all: initial;
box-sizing: initial !important;
font-size: 0 !important;
position: absolute !important;
z-index: 2147483647 !important;
text-align: center !important;
overflow: hidden !important;
-moz-user-select: none !important;
user-select: none !important;
background-color: ${settings.popupBackgroundColor} !important;
box-shadow: 0px 0px 3px rgba(0,0,0,.5) !important;
border-radius: ${settings.popupBorderRadius}px !important;
direction: ltr !important;
padding: ${settings.popupPaddingY}px ${settings.popupPaddingX}px !important;
width: initial !important;
height: initial !important;
left: initial !important;
top: initial !important;`;

	popup.style.cssText = popupCssText;

	// create all engine icons

	let sizeText = settings.popupItemSize + "px";
	let iconCssText =
`all: initial;
display: initial !important;
box-sizing: initial !important;
fontSize: 0 !important;
border-radius: ${settings.popupItemBorderRadius}px !important;
height: ${settings.popupItemSize}px !important;
width: ${settings.popupItemSize}px !important;
padding: ${3 + settings.popupItemVerticalPadding}px ${settings.popupItemPadding}px !important`;

	for (let i = 0; i < settings.searchEngines.length; i++)
	{
		let engine = settings.searchEngines[i];

		if (engine.type === "sss") {
			let sssIcon = settings.sssIcons[engine.id];

			if (sssIcon.iconPath !== undefined) {
				let iconImgSource = browser.extension.getURL(sssIcon.iconPath);
				let isInteractive = sssIcon.isInteractive !== false;	// undefined or true means it's interactive
				setupEngineIcon(engine, iconImgSource, sssIcon.name, isInteractive, iconCssText, popup, settings);
			}
			// else if (sssIcon.iconCss !== undefined) {
			// 	setupEngineCss(sssIcon, iconCssText, popup, settings);
			// }
		} else {
			let iconImgSource;

			if (engine.iconUrl.startsWith("data:")) {
				iconImgSource = engine.iconUrl;
			} else {
				let cachedIcon = settings.searchEnginesCache[engine.iconUrl];
				iconImgSource = cachedIcon ? cachedIcon : engine.iconUrl;	// should have cached icon, but if not (for some reason) fall back to URL
			}

			setupEngineIcon(engine, iconImgSource, engine.name, true, iconCssText, popup, settings);
		}
	}

	// add popup to page
	document.documentElement.appendChild(popup);

	document.documentElement.addEventListener("keypress", hidePopup);
	document.documentElement.addEventListener("mousedown", hidePopup);	// hide popup from a press down anywhere...
	popup.addEventListener("mousedown", ev => ev.stopPropagation());	// ...except on the popup itself

	if (settings.hidePopupOnPageScroll) {
		window.addEventListener("scroll", hidePopup);
	}
}

function setupEngineIcon(engine, iconImgSource, iconTitle, isInteractive, iconCssText, parent, settings)
{
	let icon = document.createElement("img");
	icon.src = iconImgSource;
	icon.title = iconTitle;
	icon.style.cssText = iconCssText;

	if (isInteractive)
	{
		if (settings.popupItemHoverBehaviour === consts.ItemHoverBehaviour_Highlight || settings.popupItemHoverBehaviour === consts.ItemHoverBehaviour_HighlightAndMove)
		{
			icon.onmouseover = () => {
				icon.style.borderBottom = `2px ${settings.popupHighlightColor} solid`;
				if (settings.popupItemBorderRadius == 0) {
					icon.style.borderRadius = "2px";
				}
				if (settings.popupItemHoverBehaviour === consts.ItemHoverBehaviour_Highlight) {
					// remove 2 pixels to counter the added border of 2px
					icon.style.paddingBottom = (3 + settings.popupItemVerticalPadding - 2) + "px";
				} else {
					// remove 2 pixels of top padding to cause icon to move up
					icon.style.paddingTop = (3 + settings.popupItemVerticalPadding - 2) + "px";
				}
			};
			icon.onmouseout = () => {
				let verticalPaddingStr = (3 + settings.popupItemVerticalPadding) + "px";
				icon.style.borderBottom = "";
				if (settings.popupItemBorderRadius == 0) {
					icon.style.borderRadius = "";
				}
				icon.style.paddingTop = verticalPaddingStr;
				icon.style.paddingBottom = verticalPaddingStr;
			};
		}

		icon.addEventListener("mouseup", onSearchEngineClick(engine, settings)); // "mouse up" instead of "click" to support middle click

		icon.style.setProperty("cursor", "pointer", "important");
		icon.style.setProperty("pointer-events", "auto", "important");
	}

	icon.addEventListener("mousedown", ev => {
		// prevents focus from changing to icon and breaking copy from input fields
		ev.preventDefault();
	});

	icon.ondragstart = () => false;	// disable dragging popup images

	parent.appendChild(icon);
	return icon;
}

// function setupEngineCss(sssIcon, iconCssText, parent, settings)
// {
// 	let div = document.createElement("div");

// 	div.style.cssText = sssIcon.iconCss;
// 	div.style.marginBottom = (3 + settings.popupItemVerticalPadding) + "px";
// 	div.style.marginTop = (3 + settings.popupItemVerticalPadding) + "px";

// 	parent.appendChild(div);
// 	return div;
// }

function setPopupPositionAndSize(popup, nEngines, settings)
{
	let itemWidth = settings.popupItemSize + settings.popupItemPadding * 2;
	let itemHeight = settings.popupItemSize + (3 + settings.popupItemVerticalPadding) * 2;

	let nPopupIconsPerRow = nEngines;
	if (!settings.useSingleRow && settings.nPopupIconsPerRow < nPopupIconsPerRow) {
		nPopupIconsPerRow = settings.nPopupIconsPerRow > 0 ? settings.nPopupIconsPerRow : 1;
	}
	let width = itemWidth * nPopupIconsPerRow;
	let height = itemHeight * Math.ceil(nEngines / nPopupIconsPerRow);

	let positionLeft;
	let positionTop;

	if (settings.popupLocation === consts.PopupLocation_Selection) {
		let rect;
		if (selection.isInEditableField) {
			rect = selection.element.getBoundingClientRect();
		} else {
			let range = selection.selection.getRangeAt(0); // get the text range
			rect = range.getBoundingClientRect();
		}
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
		let newPositionTop = pageHeight - height - 10;
		if (newPositionTop >= 0) {	// just to be sure, since some websites can have pageHeight = 0
			positionTop = pageHeight - height - 10;
		}
	}

	// set values
	popup.style.width = width + "px";
	popup.style.height = height + "px";
	popup.style.left = positionLeft + "px";
	popup.style.top = positionTop + "px";
}

function onMouseUpdate(ev)
{
	mousePositionX = ev.pageX;
	mousePositionY = ev.pageY;
}

function onSearchEngineClick(engineObject, settings)
{
	return ev => {
		if (ev.button === 1 && !canMiddleClickEngine) {
			return;	// early out and don't hide popup
		}

		if (settings.hidePopupOnSearch) {
			hidePopup();
		}

		if (ev.button === 0 || ev.button === 1)
		{
			let message = {
				type: "engineClick",
				selection: selection.text,
				engine: engineObject,
				hostname: window.location ? window.location.hostname : "",
			};

			if (ev[selectionchange.modifier]) {
				message.clickType = "ctrlClick";
			} else if (ev.button === 0) {
				message.clickType = "leftClick";
			} else {
				message.clickType = "middleClick";
			}

			browser.runtime.sendMessage(message);
		}
	};
}

function onMouseDown(ev)
{
	if (ev.button !== 1) {
		return;
	}

	let selection = window.getSelection();

	if (selection.rangeCount <= 0)
	{
		let elem = document.activeElement;

		if (elem.tagName === "TEXTAREA" || (elem.tagName === "INPUT" && elem.type !== "password")) {
			if (forceSelectionIfWithinRect(ev, elem.getBoundingClientRect())) {
				canMiddleClickEngine = false;
				return false;
			}
		}

		return;
	}

	for (let i = 0; i < selection.rangeCount; ++i)
	{
		let range = selection.getRangeAt(i); // get the text range
		if (forceSelectionIfWithinRect(ev, range.getBoundingClientRect())) {
			canMiddleClickEngine = false;
			return false;
		}
	}
}

function onMouseUp(ev)
{
	if (ev.button === 1) {
		canMiddleClickEngine = true;
	}
}

function forceSelectionIfWithinRect(ev, rect)
{
	let margin = activationSettings.middleMouseSelectionClickMargin;

	if (ev.clientX > rect.left - margin && ev.clientX < rect.right + margin
	 && ev.clientY > rect.top - margin  && ev.clientY < rect.bottom + margin)
	{
		ev.preventDefault();
		ev.stopPropagation();
		onSelectionChange(ev);
		return true;
	}
	return false;
}
