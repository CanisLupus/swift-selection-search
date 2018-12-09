var DEBUG_STATE;	// avoid TS compilation errors but still get working JS code
var cloneInto;	// avoid TS compilation errors but still get working JS code

namespace ContentScript
{
// Subset of enums from the background script (only the ones needed).
// We duplicate enum definitions because otherwise the generated JS code is incomplete.
enum SearchEngineType {
	SSS = "sss",
}
enum PopupOpenBehaviour {
	Auto = "auto",
	HoldAlt = "hold-alt",
	MiddleMouse = "middle-mouse",
}
enum PopupLocation {
	Selection = "selection",
	Cursor = "cursor",
}
enum AutoCopyToClipboard {
	Always = "always",
}
enum IconAlignment {
	Left = "left",
	Middle = "middle",
	Right = "right",
}
enum ItemHoverBehaviour {
	Nothing = "nothing",
	Highlight = "highlight",
	HighlightAndMove = "highlight-and-move",
}

class SelectionData
{
	isInEditableField: boolean;
	text: string;
	element: HTMLElement;
	selection: Selection;
}

enum MessageType {
	EngineClick = "engineClick",
	Log = "log",
	GetActivationSettings = "getActivationSettings",
	GetPopupSettings = "getPopupSettings",
}

abstract class Message
{
	constructor(public type: MessageType) { this.type = type; }
}

class EngineClickMessage extends Message
{
	selection: string;
	engine: SSS.SearchEngine;
	hostname: string;
	clickType: string;

	constructor() { super(MessageType.EngineClick); }
}

class LogMessage extends Message
{
	constructor(public log: any) { super(MessageType.Log); }
}

class GetActivationSettingsMessage extends Message
{
	constructor() { super(MessageType.GetActivationSettings); }
}

class GetPopupSettingsMessage extends Message
{
	constructor() { super(MessageType.GetPopupSettings); }
}

const DEBUG = typeof DEBUG_STATE !== "undefined" && DEBUG_STATE === true;

if (DEBUG) {
	// To have all log messages in the same console, we always request the background script to log.
	// Otherwise content script messages will be in the Web Console instead of the Dev Tools Console.
	var log = msg => browser.runtime.sendMessage(new LogMessage(msg));
}

// Globals
let popup: HTMLElement = null;
let selection: SelectionData = new SelectionData();
let mousePositionX: number = 0;
let mousePositionY: number = 0;
let canMiddleClickEngine: boolean = true;
let activationSettings: SSS.ActivationSettings = null;
let settings: SSS.Settings = null;
let sssIcons: { [id: string] : SSS.SSSIconDefinition; } = null;

// be prepared for messages from background script
browser.runtime.onMessage.addListener(onMessageReceived);
// be prepared for settings changing at any time from now
browser.storage.onChanged.addListener(onSettingsChanged);

if (DEBUG) { log("content script has started!"); }

requestActivation();

// asks the background script for activation settings to setup this content script
function requestActivation()
{
	browser.runtime.sendMessage(new GetActivationSettingsMessage()).then(
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
function getErrorHandler(text: string): (reason: any) => void
{
	if (DEBUG) {
		return error => { log(`${text} (${error})`); };
	} else {
		return undefined;
	}
}

function isObjectEmpty(obj: object): boolean
{
	for (const _ in obj) {
		return false;	// has at least one element
	}
	return true;
}

function activate(_activationSettings: SSS.ActivationSettings)
{
	activationSettings = _activationSettings;

	// now register with events based on user settings

	if (activationSettings.popupLocation === PopupLocation.Cursor) {
		document.addEventListener("mousemove", onMouseUpdate);
		document.addEventListener("mouseenter", onMouseUpdate);
	}

	if (activationSettings.popupOpenBehaviour === PopupOpenBehaviour.Auto || activationSettings.popupOpenBehaviour === PopupOpenBehaviour.HoldAlt) {
		selectionchange.start();
		document.addEventListener("customselectionchange", onSelectionChange);
	}
	else if (activationSettings.popupOpenBehaviour === PopupOpenBehaviour.MiddleMouse) {
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

	if (activationSettings.popupLocation === PopupLocation.Cursor) {
		document.removeEventListener("mousemove", onMouseUpdate);
		document.removeEventListener("mouseenter", onMouseUpdate);
	}

	if (activationSettings.popupOpenBehaviour === PopupOpenBehaviour.Auto || activationSettings.popupOpenBehaviour === PopupOpenBehaviour.HoldAlt) {
		document.removeEventListener("customselectionchange", onSelectionChange);
		selectionchange.stop();
	}
	else if (activationSettings.popupOpenBehaviour === PopupOpenBehaviour.MiddleMouse) {
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

function onSelectionChange(ev: selectionchange.CustomSelectionChangeEvent)
{
	showPopupForSelection(ev, false);
}

// called whenever selection changes or when we want to force the popup to appear for the current selection
function showPopupForSelection(ev: Event, isForced: boolean)
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
		browser.runtime.sendMessage(new GetPopupSettingsMessage()).then(
			popupSettings => {
				settings = popupSettings.settings;
				sssIcons = popupSettings.sssIcons;
				tryShowPopup(ev, isForced);
			},
			getErrorHandler("Error sending getPopupSettings message from content script.")
		);
	}
}

function saveCurrentSelection()
{
	let elem: Element = document.activeElement;

	if (elem instanceof HTMLTextAreaElement || (elem instanceof HTMLInputElement && elem.type !== "password"))
	{
		selection.isInEditableField = true;

		// for editable fields, getting the selected text is different
		selection.text = (elem as HTMLTextAreaElement).value.substring(elem.selectionStart, elem.selectionEnd);
		selection.element = elem;
	}
	else
	{
		selection.isInEditableField = false;

		// get selection, but exit if there's no text selected after all
		let selectionObject = window.getSelection();
		if (selectionObject === null) {
			return false;
		}

		let selectedText = selectionObject.toString();

		// if selection.toString() is empty, try to get string from the ranges instead (this can happen!)
		if (selectedText.length === 0)
		{
			selectedText = selectionObject.getRangeAt(0).toString();
			for (let i = 1; i < selectionObject.rangeCount; i++) {
				let range = selectionObject.getRangeAt(i);
				selectedText += range.toString();
			}
		}

		selection.text = selectedText;
		selection.selection = selectionObject;
	}

	selection.text = selection.text.trim();

	return selection.text.length > 0;
}

// shows the popup if the conditions are proper, according to settings
function tryShowPopup(ev: Event, isForced: boolean)
{
	// Usually we would check for the altKey only if "ev instanceof selectionchange.CustomSelectionChangeEvent",
	// but ev has an undefined class type in pages outside the options page, so it doesn't match. We use ev["altKey"].
	if (settings.popupOpenBehaviour === PopupOpenBehaviour.HoldAlt && !ev["altKey"]) {
		return;
	}

	if (settings.popupOpenBehaviour === PopupOpenBehaviour.Auto && selection.text.trim().length < settings.minSelectedCharacters) {
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
			let concreteElem = elem as HTMLElement;
			if (concreteElem.isContentEditable === undefined) {
				continue;	// check parent for value
			} else if (concreteElem.isContentEditable) {
				return;		// quit
			} else {
				break;		// show popup
			}
		}
	}

	if (settings.autoCopyToClipboard === AutoCopyToClipboard.Always) {
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

	if (settings.popupAnimationDuration > 0)
	{
		// Animate popup
		if (activationSettings.browserVersion < 60) {
			// On pre-Firefox 60, only animate if cloneInto exists (it doesn't in the add-on options page or other resource pages).
			// cloneInto fixes a Firefox bug that causes animations to not work in that version.
			if (typeof cloneInto === "function") {
				popup.animate(cloneInto({ transform: ["scale(0.8)", "scale(1)"] }, window), settings.popupAnimationDuration);
				popup.animate(cloneInto({ opacity: [0, 1] }, window), settings.popupAnimationDuration * 0.5);
			}
		} else {
			popup.animate({ transform: ["scale(0.8)", "scale(1)"] } as PropertyIndexedKeyframes, settings.popupAnimationDuration);
			popup.animate({ opacity: ["0", "1"] } as PropertyIndexedKeyframes, settings.popupAnimationDuration * 0.5);
		}
	}
}

function hidePopup(ev?)
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
		let icon;

		// special SSS icons with special functions
		if (engine.type === SearchEngineType.SSS)
		{
			let sssIcon = sssIcons[engine.id];

			// if (sssIcon.iconPath !== undefined) {
				let iconImgSource = browser.extension.getURL(sssIcon.iconPath);
				let isInteractive = sssIcon.isInteractive !== false;	// undefined or true means it's interactive
				icon = setupEngineIcon(engine, iconImgSource, sssIcon.name, isInteractive, iconCssText, popup, settings);
			// }
			// else if (sssIcon.iconCss !== undefined) {
			// 	setupEngineCss(sssIcon, iconCssText, popup, settings);
			// }

			if (engine.id === "separator") {
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

function setupEngineIcon(engine: SSS.SearchEngine, iconImgSource: string, iconTitle: string, isInteractive: boolean, iconCssText: string, parent: HTMLElement, settings: SSS.Settings)
{
	let icon: HTMLImageElement = document.createElement("img");
	icon.src = iconImgSource;
	icon.style.cssText = iconCssText;
	setProperty(icon, "width", settings.popupItemSize + "px");
	setProperty(icon, "height", settings.popupItemSize + "px");
	setProperty(icon, "border-radius", settings.popupItemBorderRadius + "px");
	setProperty(icon, "padding", `${3 + settings.popupItemVerticalPadding}px ${settings.popupItemPadding}px`);

	// if icon responds to mouse interaction, it needs events!
	if (isInteractive)
	{
		icon.title = iconTitle;	// only interactive icons need a title (for the tooltip)

		// set hover behaviour based on settings
		if (settings.popupItemHoverBehaviour === ItemHoverBehaviour.Highlight || settings.popupItemHoverBehaviour === ItemHoverBehaviour.HighlightAndMove)
		{
			icon.onmouseover = () => {
				setProperty(icon, "border-bottom", `2px ${settings.popupHighlightColor} solid`);
				if (settings.popupItemBorderRadius == 0) {
					setProperty(icon, "border-radius", "2px");
				}

				let verticalPaddingStr = (3 + settings.popupItemVerticalPadding - 2) + "px";
				if (settings.popupItemHoverBehaviour === ItemHoverBehaviour.Highlight) {
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
			let iconWidth = settings.popupItemPadding * 2;
			if (engine.type === SearchEngineType.SSS && engine.id === "separator") {
				iconWidth += settings.popupItemSize * settings.popupSeparatorWidth / 100;
			} else {
				iconWidth += settings.popupItemSize;
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
	let iconWidths = popup.iconWidths;

	// all engine icons have the same height
	let rowHeight = settings.popupItemSize + (3 + settings.popupItemVerticalPadding) * 2;
	let rowWidth = 0;
	let y = settings.popupPaddingY;

	let popupChildren = popup.children;
	let iAtStartOfRow = 0;

	function positionRowIcons(start, end, rowWidth, y)
	{
		let x = settings.popupPaddingX;
		if (settings.iconAlignmentInGrid === IconAlignment.Middle) {
			x += (popup.width - rowWidth) / 2;
		} else if (settings.iconAlignmentInGrid === IconAlignment.Right) {
			x += popup.width - rowWidth;
		}

		for (let i = start; i < end; i++) {
			let popupChild = popupChildren[i];
			let xOffset = -(settings.popupItemSize + settings.popupItemPadding * 2 - iconWidths[i]) / 2;
			setProperty(popupChild, "left", (x + xOffset) + "px");
			setProperty(popupChild, "top", y + "px");
			x += iconWidths[i];
		}
	}

	for (let i = 0; i < popupChildren.length; i++)
	{
		if (rowWidth + iconWidths[i] > popup.width + 0.001) {	// 0.001 is just to avoid floating point errors causing problems
			positionRowIcons(iAtStartOfRow, i, rowWidth, y);
			iAtStartOfRow = i;
			rowWidth = 0;
			y += rowHeight;
		}
		rowWidth += iconWidths[i];
	}

	positionRowIcons(iAtStartOfRow, popupChildren.length, rowWidth, y);
}

function setPopupPosition(popup, searchEngines, settings)
{
	// position popup

	let positionLeft;
	let positionTop;

	// decide popup position based on settings
	if (settings.popupLocation === PopupLocation.Selection) {
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
	else if (settings.popupLocation === PopupLocation.Cursor) {
		// right above the mouse position
		positionLeft = mousePositionX;
		positionTop = mousePositionY - popup.height - 10;	// 10 is forced padding to avoid popup being too close to cursor
	}

	// center horizontally
	positionLeft -= popup.width / 2;

	// apply user offsets from settings
	positionLeft += settings.popupOffsetX;
	positionTop -= settings.popupOffsetY;	// invert sign because y is 0 at the top

	// don't leave the page or be excessively close to leaving it

	// left/right checks
	if (positionLeft < 5) {
		positionLeft = 5;
	} else {
		let pageWidth = document.documentElement.offsetWidth + window.pageXOffset;
		if (positionLeft + popup.width + 10 > pageWidth) {
			positionLeft = pageWidth - popup.width - 10;
		}
	}

	// top/bottom checks
	if (positionTop < 5) {
		positionTop = 5;
	} else {
		let pageHeight = document.documentElement.scrollHeight;
		if (positionTop + popup.height + 10 > pageHeight) {
			let newPositionTop = pageHeight - popup.height - 10;
			if (newPositionTop >= 0) {	// just to be sure, since some websites can have pageHeight = 0
				positionTop = pageHeight - popup.height - 10;
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

function onSearchEngineClick(engine: SSS.SearchEngine, settings: SSS.Settings)
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
			let message = new EngineClickMessage();
			message.selection = selection.text;
			message.engine = engine;
			message.hostname = window.location ? window.location.hostname : "";

			if (DEBUG) {
				log("engine clicked with button " + ev.button + ": "
					+ (engine.type === SearchEngineType.SSS
						? (engine as SSS.SearchEngine_SSS).id
						: (engine as SSS.SearchEngine_Custom).searchUrl));
			}

			if (ev[selectionchange.modifierKey]) {
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

function onMouseDown(ev: MouseEvent)
{
	if (ev.button !== 1) {
		return;
	}

	let selection: Selection = window.getSelection();

	// for selections inside editable elements
	let elem: Element = document.activeElement;

	if (elem instanceof HTMLTextAreaElement || (elem instanceof HTMLInputElement && elem.type !== "password")) {
		if (forceSelectionIfWithinRect(ev, elem.getBoundingClientRect())) {
			return false;
		}
	}

	// for normal text selections
	for (let i = 0; i < selection.rangeCount; ++i)
	{
		let range: Range = selection.getRangeAt(i); // get the text range
		let bounds: ClientRect | DOMRect = range.getBoundingClientRect();
		if (bounds.width > 0 && bounds.height > 0 && forceSelectionIfWithinRect(ev, bounds)) {
			return false;
		}
	}
}

function onMouseUp(ev: MouseEvent)
{
	if (ev.button === 1) {
		// return value to normal to allow clicking engines again with middle mouse
		canMiddleClickEngine = true;
	}
}

// if ev position is within the given rect plus margin, try to show popup for the selection
function forceSelectionIfWithinRect(ev: MouseEvent, rect: ClientRect | DOMRect)
{
	let margin = activationSettings.middleMouseSelectionClickMargin;

	if (ev.clientX > rect.left - margin && ev.clientX < rect.right + margin
	 && ev.clientY > rect.top - margin  && ev.clientY < rect.bottom + margin)
	{
		// We got it! Event shouldn't do anything else.
		ev.preventDefault();
		ev.stopPropagation();
		showPopupForSelection(ev, false);

		// blocks same middle click from triggering popup on down and then a search on up (on an engine icon)
		canMiddleClickEngine = false;
		return true;
	}
	return false;
}

function setProperty(elem: HTMLElement, property: string, value: string)
{
	elem.style.setProperty(property, value, "important");
}

function removeProperty(elem: HTMLElement, property: string)
{
	elem.style.removeProperty(property);
}
}