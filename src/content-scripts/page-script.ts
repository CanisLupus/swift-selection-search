var DEBUG_STATE: boolean;	// avoid TS compilation errors but still get working JS code

namespace Types
{
	// Subset of enums from the background script (only the ones needed).
	// We duplicate enum definitions because otherwise the generated JS code is incomplete.

	export enum SearchEngineType {
		SSS = "sss",
	}
	export enum PopupOpenBehaviour {
		Auto = "auto",
		HoldAlt = "hold-alt",
		MiddleMouse = "middle-mouse",
	}
	export enum PopupLocation {
		Selection = "selection",
		Cursor = "cursor",
	}
	export enum AutoCopyToClipboard {
		Always = "always",
	}
	export enum IconAlignment {
		Left = "left",
		Middle = "middle",
		Right = "right",
	}
	export enum ItemHoverBehaviour {
		Nothing = "nothing",
		Highlight = "highlight",
		HighlightAndMove = "highlight-and-move",
	}
}

namespace ContentScript
{
	export class SelectionData
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
		clickType: string;
		href: string;

		constructor() { super(MessageType.EngineClick); }
	}

	class LogMessage extends Message
	{
		constructor(public log: any) { super(MessageType.Log); }
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
	let popup: PopupCreator.SSSPopup = null;
	let selection: SelectionData = new SelectionData();
	let mousePositionX: number = 0;
	let mousePositionY: number = 0;
	let canMiddleClickEngine: boolean = true;
	let activationSettings: SSS.ActivationSettings = null;
	let settings: SSS.Settings = null;
	let sssIcons: { [id: string] : SSS.SSSIconDefinition; } = null;
	let popupShowTimeout: number = null;

	setTimeout(() => PopupCreator.onSearchEngineClick = onSearchEngineClick, 0);

	// be prepared for messages from background script
	browser.runtime.onMessage.addListener(onMessageReceived);

	if (DEBUG) { log("content script has started!"); }

	// act when the background script requests something from this script
	function onMessageReceived(msg, sender, callbackFunc)
	{
		switch (msg.type)
		{
			case "isAlive":
				callbackFunc(true);	// simply return true to say "I'm alive!"
				break;

			case "activate":
				// if this is not the first activation, reset everything first
				if (activationSettings !== null) {
					deactivate();
				}
				activate(msg.activationSettings);	// background script passes a few settings needed for setup
				break;

			case "showPopup":
				if (saveCurrentSelection()) {
					showPopupForSelection(null, true);
				}
				break;

			case "copyToClipboardAsHtml":
				copyToClipboardAsHtml();
				break;

			case "copyToClipboardAsPlainText":
				copyToClipboardAsPlainText();
				break;

			default: break;
		}
	}

	function copyToClipboardAsHtml()
	{
		document.execCommand("copy");
	}

	function copyToClipboardAsPlainText()
	{
		document.addEventListener('copy', copyToClipboardAsPlainText_Listener);
		document.execCommand('copy');
		document.removeEventListener('copy', copyToClipboardAsPlainText_Listener);
	}

	function copyToClipboardAsPlainText_Listener(e: ClipboardEvent)
	{
		if (saveCurrentSelection()) {
			e.clipboardData.setData('text/plain', selection.text);
			e.preventDefault();
		}
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

	function activate(_activationSettings: SSS.ActivationSettings)
	{
		activationSettings = _activationSettings;

		// now register with events based on user settings

		if (activationSettings.popupLocation === Types.PopupLocation.Cursor) {
			document.addEventListener("mousemove", onMouseUpdate);
			document.addEventListener("mouseenter", onMouseUpdate);
		}

		if (activationSettings.popupOpenBehaviour === Types.PopupOpenBehaviour.Auto || activationSettings.popupOpenBehaviour === Types.PopupOpenBehaviour.HoldAlt) {
			selectionchange.start();
			document.addEventListener("customselectionchange", onSelectionChange);
		}
		else if (activationSettings.popupOpenBehaviour === Types.PopupOpenBehaviour.MiddleMouse) {
			document.addEventListener("mousedown", onMouseDown);
			document.addEventListener("mouseup", onMouseUp);
		}

		if (DEBUG) { log("content script activated, url: " + window.location.href.substr(0, 40)); }
	}

	function deactivate()
	{
		// unregister with all events (use last activation settings to figure out what registrations were made)

		if (activationSettings.popupLocation === Types.PopupLocation.Cursor) {
			document.removeEventListener("mousemove", onMouseUpdate);
			document.removeEventListener("mouseenter", onMouseUpdate);
		}

		if (activationSettings.popupOpenBehaviour === Types.PopupOpenBehaviour.Auto || activationSettings.popupOpenBehaviour === Types.PopupOpenBehaviour.HoldAlt) {
			document.removeEventListener("customselectionchange", onSelectionChange);
			selectionchange.stop();
		}
		else if (activationSettings.popupOpenBehaviour === Types.PopupOpenBehaviour.MiddleMouse) {
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
		if (popup && popup.isReceiverOfEvent(ev.event)) return;

		if (activationSettings.popupOpenBehaviour === Types.PopupOpenBehaviour.Auto && activationSettings.popupDelay > 0)
		{
			clearPopupShowTimeout();

			if (saveCurrentSelection()) {
				popupShowTimeout = setTimeout(() => showPopupForSelection(ev, false), activationSettings.popupDelay);
			}
		}
		else
		{
			if (saveCurrentSelection()) {
				showPopupForSelection(ev, false);
			}
		}
	}

	// called whenever selection changes or when we want to force the popup to appear for the current selection
	function showPopupForSelection(ev: Event, isForced: boolean)
	{
		clearPopupShowTimeout();

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

	function clearPopupShowTimeout()
	{
		if (popupShowTimeout !== null) {
			clearTimeout(popupShowTimeout);
			popupShowTimeout = null;
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
			if (selectionObject === null) return false;

			let selectedText = selectionObject.toString();

			// if selection.toString() is empty, try to get string from the ranges instead (this can happen!)
			if (selectedText.length === 0)
			{
				selectedText = "";
				for (let i = 0; i < selectionObject.rangeCount; i++) {
					selectedText += selectionObject.getRangeAt(i).toString();
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
		if (settings.popupOpenBehaviour === Types.PopupOpenBehaviour.HoldAlt && !ev["altKey"]) return;

		if (settings.popupOpenBehaviour === Types.PopupOpenBehaviour.Auto)
		{
			if ((settings.minSelectedCharacters > 0 && selection.text.length < settings.minSelectedCharacters)
			 || (settings.maxSelectedCharacters > 0 && selection.text.length > settings.maxSelectedCharacters))
			{
				return;
			}
		}

		if (!isForced)
		{
			// If showing popup for editable fields is not allowed, check if selection is in an editable field.
			if (!settings.allowPopupOnEditableFields)
			{
				if (selection.isInEditableField) return;
				// even if this is not an input field, don't show popup in contentEditable elements, such as Gmail's compose window
				if (isInEditableField(selection.selection.anchorNode)) return;
			}
			// If editable fields are allowed, they are still not allowed for keyboard selections
			else
			{
				if (!ev["isMouse"] && isInEditableField(selection.selection.anchorNode)) return;
			}
		}

		if (settings.autoCopyToClipboard === Types.AutoCopyToClipboard.Always) {
			document.execCommand("copy");
		}

		if (DEBUG) { log("showing popup, previous value was: " + popup); }

		if (popup === null) {
			popup = createPopup(settings);
		}

		if (settings.showSelectionTextField === true) {
			popup.setInputFieldText(selection.text);
		}

		popup.show();	// call "show" first so that popup size calculations are correct in setPopupPosition
		popup.setPopupPosition(settings, selection, mousePositionX, mousePositionY);

		if (settings.popupAnimationDuration > 0) {
			popup.playAnimation(settings);
		}
	}

	function createPopup(settings: SSS.Settings): PopupCreator.SSSPopup
	{
		// only define new element if not already defined (can get here multiple times if settings are reloaded)
		if (!customElements.get('sss-popup'))
		{
			// temp class that locks in settings as arguments to SSSPopup
			class SSSPopupWithSettings extends PopupCreator.SSSPopup {
				constructor() { super(getSettings(), getIcons()); }
			}

			customElements.define('sss-popup', SSSPopupWithSettings);
		}

		let popup = document.createElement("sss-popup") as PopupCreator.SSSPopup;

		document.documentElement.appendChild(popup);

		// register popup events
		document.documentElement.addEventListener("keypress", hidePopup);
		document.documentElement.addEventListener("mousedown", hidePopup);	// hide popup from a press down anywhere...
		popup.addEventListener("mousedown", ev => ev.stopPropagation());	// ...except on the popup itself

		if (settings.hidePopupOnPageScroll) {
			window.addEventListener("scroll", hidePopup);
		}

		return popup;
	}

	function getSettings(): SSS.Settings
	{
		return settings;
	}

	function getIcons(): { [id: string] : SSS.SSSIconDefinition; }
	{
		return sssIcons;
	}

	function isInEditableField(node): boolean
	{
		// to find if this element is editable, we go up the hierarchy until an element that specifies "isContentEditable" (or the root)
		for (let elem = node; elem !== document; elem = elem.parentNode)
		{
			let concreteElem = elem as HTMLElement;
			if (concreteElem.isContentEditable === undefined) {
				continue;		// check parent for value
			}
			return concreteElem.isContentEditable;
		}

		return false;
	}

	function hidePopup(ev?)
	{
		if (popup === null) return;

		// if we pressed with right mouse button and that isn't supposed to hide the popup, don't hide
		if (settings && settings.hidePopupOnRightClick === false && ev && ev.button === 2) return;

		// if event is a keypress on the text field, don't hide
		if (ev && ev.type === "keypress" && popup.isReceiverOfEvent(ev)) return;

		popup.hide();
	}

	function onMouseUpdate(ev: MouseEvent)
	{
		mousePositionX = ev.pageX;
		mousePositionY = ev.pageY;
	}

	function onSearchEngineClick(ev: MouseEvent, engine: SSS.SearchEngine, settings: SSS.Settings)
	{
		// if using middle mouse and can't, early out so we don't hide popup
		if (ev.button === 1 && !canMiddleClickEngine) return;

		if (settings.hidePopupOnSearch) {
			hidePopup();
		}

		if (ev.button === 0 || ev.button === 1)
		{
			let message = new EngineClickMessage();
			message.selection = settings.showSelectionTextField === true ? popup.getInputFieldText() : selection.text;
			message.engine = engine;

			if (window.location) {
				message.href = window.location.href;
			}

			if (DEBUG) {
				log("engine clicked with button " + ev.button + ": "
					+ (engine.type === Types.SearchEngineType.SSS
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
	}

	function onMouseDown(ev: MouseEvent)
	{
		if (ev.button !== 1) return;

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

			if (saveCurrentSelection()) {
				ev["isMouse"] = true;
				showPopupForSelection(ev, false);
			}

			// blocks same middle click from triggering popup on down and then a search on up (on an engine icon)
			canMiddleClickEngine = false;
			return true;
		}
		return false;
	}
}

namespace PopupCreator
{
	export let onSearchEngineClick = null;

	export class SSSPopup extends HTMLElement
	{
		content: HTMLDivElement;
		inputField: HTMLInputElement;
		enginesContainer: HTMLDivElement;

		constructor(settings: SSS.Settings, sssIcons: { [id: string] : SSS.SSSIconDefinition; })
		{
			super();

			Object.setPrototypeOf(this, SSSPopup.prototype);	// needed so that instanceof and casts work

			let shadowRoot = this.attachShadow({mode: 'closed'});

			let css = this.generateStylesheet(settings);
			var style = document.createElement('style');
			style.appendChild(document.createTextNode(css));
			shadowRoot.appendChild(style);

			// create popup parent (will contain all icons)
			this.content = document.createElement("div");
			this.content.classList.add("sss-content");
			shadowRoot.appendChild(this.content);

			if (settings.showSelectionTextField)
			{
				this.inputField = document.createElement('input');
				this.inputField.type = "text";
				this.inputField.classList.add("sss-input-field");
				this.content.appendChild(this.inputField);
			}

			this.enginesContainer = document.createElement("div");
			this.enginesContainer.classList.add("sss-engines");
			this.content.appendChild(this.enginesContainer);

			this.createPopupContent(settings, sssIcons);
		}

		generateStylesheet(settings: SSS.Settings)
		{
			// Due to "all: initial !important", all inherited properties that are
			// defined afterwards will also need to use !important.
			// Inherited properties: https://stackoverflow.com/a/5612360/2162837

			return `
				:host {
					all: initial !important;
				}

				.sss-content {
					font-size: 0px !important;
					direction: ltr !important;
					position: absolute;
					z-index: 2147483647;
					user-select: none;
					box-shadow: rgba(0, 0, 0, 0.5) 0px 0px 3px;
					background-color: ${settings.popupBackgroundColor};
					border-radius: ${settings.popupBorderRadius}px;
					padding: ${settings.popupPaddingY}px ${settings.popupPaddingX}px;
					text-align: center;
					${this.generateStylesheet_Width(settings)}
				}

				.sss-content img {
					width: ${settings.popupItemSize}px;
					height: ${settings.popupItemSize}px;
					padding: ${3 + settings.popupItemVerticalPadding}px ${settings.popupItemPadding}px;
					border-radius: ${settings.popupItemBorderRadius}px;
					cursor: pointer;
				}

				.sss-content img:hover {
					${this.generateStylesheet_IconHover(settings)}
				}

				.separator {
					${this.generateStylesheet_Separator(settings)}
				}

				.sss-engines {
					${this.generateStylesheet_TextAlign(settings)}
				}

				.sss-input-field {
					box-sizing: border-box;
					width: calc(100% - 8px);
					border: 1px solid #ccc;
					border-radius: ${settings.popupBorderRadius}px;
					padding: 4px 7px;
					margin: 4px 0px 2px 0px;
				}

				.sss-input-field:hover {
					border: 1px solid ${settings.popupHighlightColor};
				}
			`;
		}

		generateStylesheet_TextAlign(settings: SSS.Settings): string
		{
			let textAlign: string = "center";

			if (!settings.useSingleRow)
			{
				switch (settings.iconAlignmentInGrid) {
					case Types.IconAlignment.Left: textAlign = "left"; break;
					case Types.IconAlignment.Right: textAlign = "right"; break;
				}
			}

			return `text-align: ${textAlign} !important;`;
		}

		generateStylesheet_Width(settings: SSS.Settings): string
		{
			let width: number;

			if (settings.useSingleRow)
			{
				// Calculate the final width of the popup based on the known widths and paddings of everything.
				// We need this so that if the popup is created too close to the borders of the page it still gets the right size.
				let nSeparators = settings.searchEngines.filter(e => e.type === Types.SearchEngineType.SSS && e.id === "separator").length;
				let nPopupIcons: number = settings.searchEngines.length - nSeparators;
				width = nPopupIcons * (settings.popupItemSize + 2 * settings.popupItemPadding);
				width += nSeparators * (settings.popupItemSize * settings.popupSeparatorWidth / 100 + 2 * settings.popupItemPadding);
			}
			else
			{
				let nPopupIconsPerRow: number = Math.max(1, Math.min(settings.nPopupIconsPerRow, settings.searchEngines.length));
				width = nPopupIconsPerRow * (settings.popupItemSize + 2 * settings.popupItemPadding);
			}

			return `width: ${width}px;`;
		}

		generateStylesheet_IconHover(settings: SSS.Settings): string
		{
			if (settings.popupItemHoverBehaviour === Types.ItemHoverBehaviour.Nothing) return "";

			return `
				border-bottom: 2px ${settings.popupHighlightColor} solid;
				border-radius: ${settings.popupItemBorderRadius == 0 ? 2 : settings.popupItemBorderRadius}px;
				${settings.popupItemHoverBehaviour === Types.ItemHoverBehaviour.HighlightAndMove
					? `margin-top: ${-3 - settings.popupItemVerticalPadding + 2}px;`
					: `padding-bottom: ${3 + settings.popupItemVerticalPadding - 2}px;`}
			`;
		}

		generateStylesheet_Separator(settings: SSS.Settings): string
		{
			let separatorWidth = settings.popupItemSize * settings.popupSeparatorWidth / 100;
			let separatorMargin = (separatorWidth - settings.popupItemSize) / 2;

			return `
				pointer-events: none !important;
				margin-left: ${separatorMargin}px;
				margin-right: ${separatorMargin}px;
			`;
		}

		createPopupContent(settings: SSS.Settings, sssIcons: { [id: string] : SSS.SSSIconDefinition; })
		{
			// add each engine to the popup
			for (let i = 0; i < settings.searchEngines.length; i++)
			{
				let engine = settings.searchEngines[i];
				let icon: HTMLImageElement;

				// special SSS icons with special functions
				if (engine.type === Types.SearchEngineType.SSS)
				{
					let sssIcon = sssIcons[engine.id];

					let iconImgSource = browser.extension.getURL(sssIcon.iconPath);
					let isInteractive = sssIcon.isInteractive !== false;	// undefined or true means it's interactive
					icon = this.setupEngineIcon(engine, iconImgSource, sssIcon.name, isInteractive, settings);

					if (engine.id === "separator") {
						icon.classList.add("separator");
					}
				}
				// "normal" custom search engines
				else
				{
					let iconImgSource: string;

					if (engine.iconUrl.startsWith("data:")) {
						iconImgSource = engine.iconUrl;	// use "URL" directly, as it's pure image data
					} else {
						let cachedIcon = settings.searchEnginesCache[engine.iconUrl];
						iconImgSource = cachedIcon ? cachedIcon : engine.iconUrl;	// should have cached icon, but if not (for some reason) fall back to URL
					}

					icon = this.setupEngineIcon(engine, iconImgSource, engine.name, true, settings);
				}

				this.enginesContainer.appendChild(icon);
			}
		}

		setupEngineIcon(engine: SSS.SearchEngine, iconImgSource: string, iconTitle: string, isInteractive: boolean, settings: SSS.Settings): HTMLImageElement
		{
			let icon: HTMLImageElement = document.createElement("img");
			icon.src = iconImgSource;

			// if icon responds to mouse interaction
			if (isInteractive) {
				icon.title = iconTitle;	// tooltip
				icon.addEventListener("mouseup", ev => onSearchEngineClick(ev, engine, settings)); // "mouse up" instead of "click" to support middle click
			}

			// prevents focus from changing to icon and breaking copy from input fields
			icon.addEventListener("mousedown", ev => ev.preventDefault());
			// disable dragging popup images
			icon.ondragstart = () => false;

			return icon;
		}

		setPopupPosition(settings: SSS.Settings, selection: ContentScript.SelectionData, mousePositionX: number, mousePositionY: number)
		{
			let bounds = this.content.getBoundingClientRect();
			let width = bounds.width;
			let height = bounds.height;

			// position popup

			let positionLeft: number;
			let positionTop: number;

			// decide popup position based on settings
			if (settings.popupLocation === Types.PopupLocation.Selection) {
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
			else if (settings.popupLocation === Types.PopupLocation.Cursor) {
				// right above the mouse position
				positionLeft = mousePositionX;
				positionTop = mousePositionY - height - 10;	// 10 is forced padding to avoid popup being too close to cursor
			}

			// center horizontally
			positionLeft -= width / 2;

			// apply user offsets from settings
			positionLeft += settings.popupOffsetX;
			positionTop -= settings.popupOffsetY;	// invert sign because y is 0 at the top

			// don't leave the page or be excessively close to leaving it

			// left/right checks
			if (positionLeft < 5) {
				positionLeft = 5;
			} else {
				let pageWidth = document.documentElement.offsetWidth + window.pageXOffset;
				if (positionLeft + width + 10 > pageWidth) {
					positionLeft = pageWidth - width - 10;
				}
			}

			// top/bottom checks
			if (positionTop < 5) {
				positionTop = 5;
			} else {
				let pageHeight = document.documentElement.scrollHeight;
				if (positionTop + height + 10 > pageHeight) {
					let newPositionTop = pageHeight - height - 10;
					if (newPositionTop >= 0) {	// just to be sure, since some websites can have pageHeight = 0
						positionTop = pageHeight - height - 10;
					}
				}
			}

			// finally set the size and position values
			this.content.style.setProperty("left", positionLeft + "px");
			this.content.style.setProperty("top", positionTop + "px");
		}

		playAnimation(settings: SSS.Settings)
		{
			this.content.animate({ transform: ["scale(0.8)", "scale(1)"] } as PropertyIndexedKeyframes, settings.popupAnimationDuration);
			this.content.animate({ opacity: ["0", "1"] } as PropertyIndexedKeyframes, settings.popupAnimationDuration * 0.5);
		}

		isReceiverOfEvent(ev: Event)
		{
			return ev.target === this;
		}

		setInputFieldText(text: string)
		{
			this.inputField.value = text;
		}

		getInputFieldText(): string
		{
			return this.inputField.value;
		}

		show()
		{
			this.content.style.setProperty("display", "inline-block");
		}

		hide()
		{
			this.content.style.setProperty("display", "none");
		}
	}
}
