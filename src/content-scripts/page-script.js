"use strict";

if (DEBUG) {
	// To have all log messages in the same console, we always request the background to log.
	// Otherwise content script messages are in the Web Console instead of the Dev Tools Console.
	var log = msg => browser.runtime.sendMessage({ type: "log", log: msg });
}

// Subset of needed consts from the background script (avoids having to ask for them).
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

// be prepared for messages from background script
browser.runtime.onMessage.addListener(onMessageReceived);
// be prepared for settings changing at any time from now
browser.storage.onChanged.addListener(onSettingsChanged);

if (DEBUG) { log("content script has started!"); }

requestActivation();

// asks the background script for activation settings to setup this content script
function requestActivation()
{
	browser.runtime.sendMessage({ type: "getActivationSettings" }).then(
		activationSettings => activate(activationSettings),	// background script passes a few settings needed for setup
		getErrorHandler("Error sending getActivationSettings message from content script.")
	);
}

// act when the background script requests something from this script
function onMessageReceived(msg, sender, callbackFunc)
{
	switch (msg.type)
	{
		case "isAlive":
			callbackFunc(true);	// simply return true to say "I'm alive!"
			break;

		case "showPopup":
			showPopupForSelection(null, true);
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

	// settings changed, so reset everything and request activation with new settings
	deactivate();
	requestActivation();
}

// default error handler for promises
function getErrorHandler(text)
{
	if (DEBUG) {
		return error => { log(`${text} (${error})`); };
	} else {
		return undefined;
	}
}

function isObjectEmpty(object)
{
	for (const key in object) {
		return false;	// has at least one element
	}
	return true;
}

function activate(_activationSettings)
{
	activationSettings = _activationSettings;

	// now register with events based on user settings

	if (activationSettings.popupLocation === consts.PopupLocation_Cursor) {
		document.addEventListener("mousemove", onMouseUpdate);
		document.addEventListener("mouseenter", onMouseUpdate);
	}

	if (activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_Auto || activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_HoldAlt) {
		selectionchange.start();
		document.addEventListener("customselectionchange", showPopupForSelection);
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

	// unregister with all events (use last activation settings to figure out what registrations were made)

	if (activationSettings.popupLocation === consts.PopupLocation_Cursor) {
		document.removeEventListener("mousemove", onMouseUpdate);
		document.removeEventListener("mouseenter", onMouseUpdate);
	}

	if (activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_Auto || activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_HoldAlt) {
		document.removeEventListener("customselectionchange", showPopupForSelection);
		selectionchange.stop();
	}
	else if (activationSettings.popupOpenBehaviour === consts.PopupOpenBehaviour_MiddleMouse) {
		document.removeEventListener("mousedown", onMouseDown);
		document.removeEventListener("mouseup", onMouseUp);
	}

	if (popup !== null)
	{
		// unregister popup events and remove the popup from the page

		document.documentElement.removeEventListener("keypress", hidePopup);
		document.documentElement.removeEventListener("mousedown", hidePopup);
		if (settings.hidePopupOnPageScroll) {
			window.removeEventListener("scroll", hidePopup);
		}

		document.documentElement.removeChild(popup);
		popup = null;

		// other listeners in the popup are destroyed along with their objects
	}

	// also clear any previously saved settings
	activationSettings = null;
	settings = null;

	if (DEBUG) { log("content script deactivated"); }
}

// called whenever selection changes or when we want to force the popup to appear for the current selection
function showPopupForSelection(ev, isForced)
{
	let hasSelection = saveCurrentSelection();
	if (!hasSelection) {
		return;
	}

	if (settings !== null) {
		// if we have settings already, use them...
		tryShowPopup(ev, isForced);
	} else {
		// ...otherwise ask the background script for all needed settings, store them, and THEN try to show the popup
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
		// for editable fields, getting the selected text is different
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

// shows the popup if the conditions are proper, according to settings
function tryShowPopup(ev, isForced)
{
	if (settings.popupOpenBehaviour === consts.PopupOpenBehaviour_HoldAlt && !ev.altKey) {
		return;
	}

	if (settings.popupOpenBehaviour === consts.PopupOpenBehaviour_Auto && selection.text.trim().length < settings.minSelectedCharacters) {
		return;
	}

	// Checks for showing popup in editable fields. If this is a forced selection or editable fields are allowed, always show.
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
		setupPopupSize(popup, settings.searchEngines, settings);
		setupPopupIconPositions(popup, settings.searchEngines, settings);
	}

	showPopup(settings);
}

function showPopup(settings)
{
	if (popup === null) {
		return;
	}

	setProperty(popup, "display", "inline-block");
	setPopupPosition(popup, settings.searchEngines, settings);

	// Animate popup (only if cloneInto exists, which it doesn't in add-on resource pages).
	// cloneInto fixes a Firefox bug that causes animations to not work (pre-Firefox 60?).
	if (settings.popupAnimationDuration > 0 && typeof cloneInto === "function") {
		popup.animate(cloneInto({ transform: ["scale(0.8)", "scale(1)"] }, window), settings.popupAnimationDuration);
		popup.animate(cloneInto({ opacity: [0, 1] }, window), settings.popupAnimationDuration * 0.5);
	}
}

function hidePopup(ev)
{
	if (popup === null) {
		return;
	}

	// if we pressed with right mouse button and that isn't supposed to hide the popup, don't hide
	if (settings && settings.hidePopupOnRightClick === false && ev && ev.button === 2) {
		return;
	}

	setProperty(popup, "display", "none");
}

function createPopup(settings)
{
	// base popup format, resetting every property to initial first (a few are defined explicitely because of websites overriding with "important")
	let popupCssText = `
all: initial;
box-sizing: initial !important;
font-size: 0 !important;
position: absolute !important;
z-index: 2147483647 !important;
text-align: center !important;
overflow: hidden !important;
-moz-user-select: none !important;
user-select: none !important;
box-shadow: 0px 0px 3px rgba(0,0,0,.5) !important;
direction: ltr !important;
`;

	// base format for each icon (image)
	let iconCssText = `
all: initial;
display: initial !important;
position: absolute !important;
box-sizing: initial !important;
fontSize: 0 !important;
`;

	// create popup parent (will contain all icons)
	popup = document.createElement("swift-selection-search-popup");
	popup.style.cssText = popupCssText;
	setProperty(popup, "background-color", settings.popupBackgroundColor);
	setProperty(popup, "border-radius", settings.popupBorderRadius + "px");
	setProperty(popup, "padding", `${settings.popupPaddingY}px ${settings.popupPaddingX}px`);

	// add each engine to the popup
	for (let i = 0; i < settings.searchEngines.length; i++)
	{
		let engine = settings.searchEngines[i];
		let iconWidth = settings.popupItemSize;
		let icon;

		// special SSS icons with special functions
		if (engine.type === "sss")
		{
			let sssIcon = settings.sssIcons[engine.id];

			// if (sssIcon.iconPath !== undefined) {
				let iconImgSource = browser.extension.getURL(sssIcon.iconPath);
				let isInteractive = sssIcon.isInteractive !== false;	// undefined or true means it's interactive
				icon = setupEngineIcon(engine, iconImgSource, sssIcon.name, isInteractive, iconCssText, popup, settings);
			// }
			// else if (sssIcon.iconCss !== undefined) {
			// 	setupEngineCss(sssIcon, iconCssText, popup, settings);
			// }

			if (engine.id === "separator") {
				setProperty(icon, "transform", "translateX(-50%)");
				setProperty(icon, "margin-left", "50%");
				setProperty(icon, "pointer-events", "none");
			}
		}
		// "normal" custom search engines
		else
		{
			let iconImgSource;

			if (engine.iconUrl.startsWith("data:")) {
				iconImgSource = engine.iconUrl;	// use "URL" directly, as it's pure image data
			} else {
				let cachedIcon = settings.searchEnginesCache[engine.iconUrl];
				iconImgSource = cachedIcon ? cachedIcon : engine.iconUrl;	// should have cached icon, but if not (for some reason) fall back to URL
			}

			icon = setupEngineIcon(engine, iconImgSource, engine.name, true, iconCssText, popup, settings);
		}

		setProperty(icon, "width", settings.popupItemSize + "px");
	}

	// add popup to page
	document.documentElement.appendChild(popup);

	// register popup events
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
	icon.style.cssText = iconCssText;
	setProperty(icon, "border-radius", settings.popupItemBorderRadius + "px");
	setProperty(icon, "height", settings.popupItemSize + "px");
	setProperty(icon, "padding", `${3 + settings.popupItemVerticalPadding}px ${settings.popupItemPadding}px`);

	// if icon responds to mouse interaction, it needs events!
	if (isInteractive)
	{
		icon.title = iconTitle;	// only interactive icons need a title (for the tooltip)

		// set hover behaviour based on settings
		if (settings.popupItemHoverBehaviour === consts.ItemHoverBehaviour_Highlight || settings.popupItemHoverBehaviour === consts.ItemHoverBehaviour_HighlightAndMove)
		{
			icon.onmouseover = () => {
				setProperty(icon, "border-bottom", `2px ${settings.popupHighlightColor} solid`);
				if (settings.popupItemBorderRadius == 0) {
					setProperty(icon, "border-radius", "2px");
				}

				let verticalPaddingStr = (3 + settings.popupItemVerticalPadding - 2) + "px";
				if (settings.popupItemHoverBehaviour === consts.ItemHoverBehaviour_Highlight) {
					// remove 2 pixels to counter the added border of 2px
					setProperty(icon, "padding-bottom", verticalPaddingStr);
				} else {
					// remove 2 pixels of top padding to cause icon to move up
					setProperty(icon, "padding-top", verticalPaddingStr);
				}
			};

			icon.onmouseout = () => {
				removeProperty(icon, "border-bottom");
				if (settings.popupItemBorderRadius == 0) {
					removeProperty(icon, "border-radius");
				}

				let verticalPaddingStr = (3 + settings.popupItemVerticalPadding) + "px";
				setProperty(icon, "padding-top", verticalPaddingStr);
				setProperty(icon, "padding-bottom", verticalPaddingStr);
			};
		}

		// essential event for clicking the engines
		icon.addEventListener("mouseup", onSearchEngineClick(engine, settings)); // "mouse up" instead of "click" to support middle click

		// these would be in the CSS format block for the icons, but only interactive icons can have them
		setProperty(icon, "cursor", "pointer");
		setProperty(icon, "pointer-events", "auto");
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

function setupPopupSize(popup, searchEngines, settings)
{
	let nPopupIconsPerRow;
	if (!settings.useSingleRow && settings.nPopupIconsPerRow < searchEngines.length) {
		nPopupIconsPerRow = settings.nPopupIconsPerRow > 0 ? settings.nPopupIconsPerRow : 1;
	} else {
		nPopupIconsPerRow = searchEngines.length;
	}

	// Calculate popup width (not all icons have the same width).
	// This deals with both single row and grid layouts.

	var iconWidths = [];
	let popupWidth = 0;

	for (let i = 0; i < searchEngines.length; i += nPopupIconsPerRow)
	{
		let rowWidth = 0;
		let limit = Math.min(i + nPopupIconsPerRow, searchEngines.length);

		for (let j = i; j < limit; j++)
		{
			let engine = searchEngines[j];
			let iconWidth;
			if (engine.type === "sss" && engine.id === "separator") {
				iconWidth = settings.popupItemSize * settings.popupSeparatorWidth / 100;
			} else {
				iconWidth = settings.popupItemSize + settings.popupItemPadding * 2;
			}

			iconWidths.push(iconWidth);
			rowWidth += iconWidth;
		}

		if (popupWidth < rowWidth) {
			popupWidth = rowWidth;
		}
	}

	// Calculate popup height (number of "rows" iterated through above might not be the real number)

	// all engine icons have the same height
	let rowHeight = settings.popupItemSize + (3 + settings.popupItemVerticalPadding) * 2;
	let popupHeight = rowHeight;

	let rowWidth = 0;

	for (let i = 0; i < iconWidths.length; i++)
	{
		rowWidth += iconWidths[i];

		if (rowWidth > popupWidth + 0.001) {	// 0.001 is just to avoid floating point errors causing problems
			popupHeight += rowHeight;
			rowWidth = iconWidths[i];
		}
	}

	// finally set the size and position values
	setProperty(popup, "width",  popupWidth + "px");
	setProperty(popup, "height", popupHeight + "px");

	popup.width = popupWidth;
	popup.height = popupHeight;
	popup.iconWidths = iconWidths;
}

function setupPopupIconPositions(popup, searchEngines, settings)
{
	let popupWidth = popup.width;
	let popupHeight = popup.height;
	let iconWidths = popup.iconWidths;

	// all engine icons have the same height
	let rowHeight = settings.popupItemSize + (3 + settings.popupItemVerticalPadding) * 2;
	let rowWidth = 0;
	let y = settings.popupPaddingY;

	let popupChildren = popup.children;
	let iAtStartOfRow = 0;

	function positionRowIcons(start, end)
	{
		let x = (popupWidth - rowWidth) / 2 + settings.popupPaddingX;
		for (let j = start; j < end; j++) {
			let popupChild = popupChildren[j];
			setProperty(popupChild, "left", x + "px");
			setProperty(popupChild, "top", y + "px");
			x += iconWidths[j];
		}
	}

	for (let i = 0; i < popupChildren.length; i++)
	{
		if (rowWidth + iconWidths[i] > popupWidth + 0.001) {	// 0.001 is just to avoid floating point errors causing problems
			positionRowIcons(iAtStartOfRow, i);
			iAtStartOfRow = i;
			rowWidth = iconWidths[i];
			y += rowHeight;
		} else {
			rowWidth += iconWidths[i];
		}
	}

	positionRowIcons(iAtStartOfRow, popupChildren.length);
}

function setPopupPosition(popup, searchEngines, settings)
{
	let popupWidth = popup.width;
	let popupHeight = popup.height;

	// position popup

	let positionLeft;
	let positionTop;

	// decide popup position based on settings
	if (settings.popupLocation === consts.PopupLocation_Selection) {
		let rect;
		if (selection.isInEditableField) {
			rect = selection.element.getBoundingClientRect();
		} else {
			let range = selection.selection.getRangeAt(0); // get the text range
			rect = range.getBoundingClientRect();
		}
		// lower right corner of selected text's "bounds"
		positionLeft = rect.right + window.pageXOffset;
		positionTop = rect.bottom + window.pageYOffset;
	}
	else if (settings.popupLocation === consts.PopupLocation_Cursor) {
		// right above the mouse position
		positionLeft = mousePositionX;
		positionTop = mousePositionY - popupHeight - 10;	// 10 is forced padding to avoid popup being too close to cursor
	}

	// center horizontally
	positionLeft -= popupWidth / 2;

	// apply user offsets from settings
	positionLeft += settings.popupOffsetX;
	positionTop -= settings.popupOffsetY;	// invert sign because y is 0 at the top

	// don't leave the page or be excessively close to leaving it

	// left/right checks
	if (positionLeft < 5) {
		positionLeft = 5;
	} else {
		let pageWidth = document.documentElement.offsetWidth + window.pageXOffset;
		if (positionLeft + popupWidth + 10 > pageWidth) {
			positionLeft = pageWidth - popupWidth - 10;
		}
	}

	// top/bottom checks
	if (positionTop < 5) {
		positionTop = 5;
	} else {
		let pageHeight = document.documentElement.scrollHeight;
		if (positionTop + popupHeight + 10 > pageHeight) {
			let newPositionTop = pageHeight - popupHeight - 10;
			if (newPositionTop >= 0) {	// just to be sure, since some websites can have pageHeight = 0
				positionTop = pageHeight - popupHeight - 10;
			}
		}
	}

	// finally set the size and position values
	setProperty(popup, "left", positionLeft + "px");
	setProperty(popup, "top",  positionTop + "px");
}

function onMouseUpdate(ev)
{
	mousePositionX = ev.pageX;
	mousePositionY = ev.pageY;
}

function onSearchEngineClick(engineObject, settings)
{
	return ev => {
		// if using middle mouse and can't, early out so we don't hide popup
		if (ev.button === 1 && !canMiddleClickEngine) {
			return;
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

	// for selections inside editable elements
	if (selection.rangeCount <= 0)
	{
		let elem = document.activeElement;

		if (elem.tagName === "TEXTAREA" || (elem.tagName === "INPUT" && elem.type !== "password")) {
			if (forceSelectionIfWithinRect(ev, elem.getBoundingClientRect())) {
				return false;
			}
		}
	}
	// for normal text selections
	else
	{
		for (let i = 0; i < selection.rangeCount; ++i)
		{
			let range = selection.getRangeAt(i); // get the text range
			if (forceSelectionIfWithinRect(ev, range.getBoundingClientRect())) {
				return false;
			}
		}
	}
}

function onMouseUp(ev)
{
	if (ev.button === 1) {
		// return value to normal to allow clicking engines again with middle mouse
		canMiddleClickEngine = true;
	}
}

// if ev position is within the given rect plus margin, try to show popup for the selection
function forceSelectionIfWithinRect(ev, rect)
{
	let margin = activationSettings.middleMouseSelectionClickMargin;

	if (ev.clientX > rect.left - margin && ev.clientX < rect.right + margin
	 && ev.clientY > rect.top - margin  && ev.clientY < rect.bottom + margin)
	{
		// We got it! Event shouldn't do anything else.
		ev.preventDefault();
		ev.stopPropagation();
		showPopupForSelection(ev);

		// blocks same middle click from triggering popup on down and then a search on up (on an engine icon)
		canMiddleClickEngine = false;
		return true;
	}
	return false;
}

function setProperty(elem, property, value)
{
	elem.style.setProperty(property, value, "important");
}

function removeProperty(elem, property)
{
	elem.style.removeProperty(property);
}