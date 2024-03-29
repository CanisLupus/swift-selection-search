/*

Content script that gets injected into all webpages (actually all frames) for the SSS popup to work.
This script is initialized by the background script and, when needed, requests all the required info
to show the popup. It also listens for text selections and applies formatting to the popup, based
on the user's settings.

*/

var DEBUG_STATE: boolean;	// avoid TS compilation errors but still get working JS code

namespace ContentScript
{
	export class SelectionData
	{
		isInInputField: boolean;	// doesn't include "content editable" fields (use isInContentEditableField() for that)
		unprocessedText: string;
		text: string;
		element: HTMLElement;
		selection: Selection;
	}

	// TODO: move this enum to the background script and add all possible messages
	const enum MessageType {
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
		href: string;
		openingBehaviour: SSS.OpenResultBehaviour;

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
	const selection: SelectionData = new SelectionData();
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

				// refuse activation on non-HTML documents like XML
				if (document.documentElement.nodeName !== "HTML") {
					break;
				}

				activate(msg.activationSettings, msg.isPageBlocked);	// background script passes a few settings needed for setup
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
		document.addEventListener("copy", copyToClipboardAsPlainText_Listener);
		document.execCommand("copy");
		document.removeEventListener("copy", copyToClipboardAsPlainText_Listener);
	}

	function copyToClipboardAsPlainText_Listener(e: ClipboardEvent)
	{
		if (saveCurrentSelection()) {
			e.clipboardData.setData("text/plain", selection.unprocessedText);
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

	function activate(_activationSettings: SSS.ActivationSettings, isPageBlocked: boolean)
	{
		activationSettings = _activationSettings;

		// now register with events based on user settings

		if (activationSettings.popupLocation === SSS.PopupLocation.Cursor) {
			document.addEventListener("mousemove", onMouseUpdate);
			document.addEventListener("mouseenter", onMouseUpdate);
		}

		if (activationSettings.useEngineShortcutWithoutPopup) {
			document.documentElement.addEventListener("keydown", onKeyDown);
		}

		if (!isPageBlocked)
		{
			if (activationSettings.popupOpenBehaviour === SSS.PopupOpenBehaviour.Auto || activationSettings.popupOpenBehaviour === SSS.PopupOpenBehaviour.HoldAlt) {
				selectionchange.start();
				document.addEventListener("customselectionchange", onSelectionChange);
			}
			else if (activationSettings.popupOpenBehaviour === SSS.PopupOpenBehaviour.MiddleMouse) {
				document.addEventListener("mousedown", onMouseDown);
				document.addEventListener("mouseup", onMouseUp);
			}
		}

		if (DEBUG) { log("content script activated, url: " + window.location.href.substr(0, 40)); }
	}

	function deactivate()
	{
		// unregister with all events

		document.removeEventListener("mousemove", onMouseUpdate);
		document.removeEventListener("mouseenter", onMouseUpdate);
		document.removeEventListener("mousedown", onMouseDown);
		document.removeEventListener("mouseup", onMouseUp);

		document.removeEventListener("customselectionchange", onSelectionChange);
		selectionchange.stop();

		document.documentElement.removeEventListener("keydown", onKeyDown);
		document.documentElement.removeEventListener("mousedown", maybeHidePopup);

		window.removeEventListener("scroll", maybeHidePopup);

		// remove the popup from the page (other listeners in the popup are destroyed along with their objects)
		if (popup !== null) {
			document.documentElement.removeChild(popup);
			popup = null;
		}

		// also clear any previously saved settings
		activationSettings = null;
		settings = null;

		if (DEBUG) { log("content script deactivated"); }
	}

	function onSelectionChange(ev: selectionchange.CustomSelectionChangeEvent)
	{
		if (popup && popup.isReceiverOfEvent(ev.event)) return;

		if (activationSettings.popupOpenBehaviour === SSS.PopupOpenBehaviour.Auto && activationSettings.popupDelay > 0)
		{
			clearPopupShowTimeout();

			if (saveCurrentSelection()) {
				popupShowTimeout = window.setTimeout(() => showPopupForSelection(ev, false), activationSettings.popupDelay);	// use "window.setTimeout" to avoid problems with TS type definitions
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
			acquireSettings(() => tryShowPopup(ev, isForced));
		}
	}

	function acquireSettings(onSettingsAcquired: () => void)
	{
		browser.runtime.sendMessage(new GetPopupSettingsMessage()).then(
			popupSettings => {
				settings = popupSettings.settings;
				sssIcons = popupSettings.sssIcons;
				onSettingsAcquired();
			},
			getErrorHandler("Error sending getPopupSettings message from content script.")
		);
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
		const elem: Element = document.activeElement;

		if (elem instanceof HTMLTextAreaElement || (elem instanceof HTMLInputElement && elem.type !== "password"))
		{
			selection.isInInputField = true;

			// for editable fields, getting the selected text is different
			selection.unprocessedText = (elem as HTMLTextAreaElement).value.substring(elem.selectionStart, elem.selectionEnd);
			selection.element = elem;
		}
		else
		{
			selection.isInInputField = false;

			// get selection, but exit if there's no text selected after all
			const selectionObject = window.getSelection();
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

			selection.unprocessedText = selectedText;
			selection.selection = selectionObject;
		}

		selection.unprocessedText = selection.unprocessedText.trim();

		let text = selection.unprocessedText;
		text = text.replace(/[\r\n]+/g, " ");	// replace newlines with spaces
		text = text.replace(/\s\s+/g, " ");		// replace consecutive whitespaces
		selection.text = text;

		return selection.text.length > 0;
	}

	// shows the popup if the conditions are proper, according to settings
	function tryShowPopup(ev: Event, isForced: boolean)
	{
		// [TypeScript]: Usually we would check for the altKey only if "ev instanceof selectionchange.CustomSelectionChangeEvent",
		// but ev has an undefined class type in pages outside the options page, so it doesn't match. We use ev["altKey"].
		if (settings.popupOpenBehaviour === SSS.PopupOpenBehaviour.HoldAlt && !ev["altKey"]) return;

		if (settings.popupOpenBehaviour === SSS.PopupOpenBehaviour.Auto)
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
				if (selection.isInInputField) return;
				// even if this is not an input field, don't show popup in contentEditable elements, such as Gmail's compose window
				if (isInContentEditableField(selection.selection.anchorNode)) return;
			}
			// If editable fields are allowed, they are still not allowed for keyboard selections
			else
			{
				if (!ev["isMouse"] && isInContentEditableField(selection.selection.anchorNode)) return;
			}
		}

		if (settings.autoCopyToClipboard === SSS.AutoCopyToClipboard.Always
		|| (settings.autoCopyToClipboard === SSS.AutoCopyToClipboard.NonEditableOnly
			&& !selection.isInInputField
			&& !isInContentEditableField(selection.selection.anchorNode)))
		{
			if (DEBUG) { log("auto copied to clipboard: " + selection.text); }
			document.execCommand("copy");
		}

		if (DEBUG) { log("showing popup, previous value was: " + popup); }

		if (popup === null) {
			popup = createPopup(settings);
		}

		if (settings.showSelectionTextField === true)
		{
			popup.setInputFieldText(selection.text);

			if (isForced) {	// if forced by keyboard, focus the text field
				setTimeout(() => popup.setFocusOnInputFieldText(), 0);
			}
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
		if (!customElements.get("sss-popup"))
		{
			// temp class that locks in settings as arguments to SSSPopup
			class SSSPopupWithSettings extends PopupCreator.SSSPopup {
				constructor() { super(getSettings(), getIcons()); }
			}

			customElements.define("sss-popup", SSSPopupWithSettings);
		}

		const popup = document.createElement("sss-popup") as PopupCreator.SSSPopup;

		document.documentElement.appendChild(popup);

		// register popup events
		if (!settings.useEngineShortcutWithoutPopup) {	// if we didn't register the keydown listener before, do it now
			document.documentElement.addEventListener("keydown", onKeyDown);
		}
		document.documentElement.addEventListener("mousedown", maybeHidePopup);	// hide popup from a press down anywhere...
		popup.addEventListener("mousedown", ev => ev.stopPropagation());	// ...except on the popup itself

		if (settings.hidePopupOnPageScroll) {
			window.addEventListener("scroll", maybeHidePopup);
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

	function isInContentEditableField(node): boolean
	{
		// to find if this element is editable, we go up the hierarchy until an element that specifies "isContentEditable" (or the root)
		for (let elem = node; elem !== document; elem = elem.parentNode)
		{
			const concreteElem = elem as HTMLElement;
			if (concreteElem.isContentEditable === undefined) {
				continue;		// check parent for value
			}
			return concreteElem.isContentEditable;
		}

		return false;
	}

	function isAnyEditableFieldFocused()
	{
		const elem: Element = document.activeElement;
		return elem instanceof HTMLTextAreaElement || (elem instanceof HTMLInputElement && elem.type !== "password") || isInContentEditableField(elem);
	}

	function getEngineWithShortcut(key)
	{
		// Look through the search engines to find if one them has a shortcut that matches the pressed key
		key = key.toUpperCase();
		return settings.searchEngines.find(e => e.shortcut === key);
	}

	function onKeyDown(ev)
	{
		// Check if the user pressed a shortcut.
		// The popup must be visible, unless 'Always enable shortcuts' is checked.

		const isPopupVisible = popup !== null && popup.isShown();

		if (!ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey	// modifiers are not supported right now
			&& !isAnyEditableFieldFocused())							// shortcuts are disabled in editable fields
		{
			if ((isPopupVisible && ev.originalTarget.className !== "sss-input-field")				// if using popup, make sure we're not inside the popup's text field
				|| (activationSettings.useEngineShortcutWithoutPopup && saveCurrentSelection()))	// if outside popup, ensure a selection exists, otherwise we crash later
			{
				if (settings !== null) {
					searchWithEngineUsingShortcut(ev.key);
				} else {
					acquireSettings(() => searchWithEngineUsingShortcut(ev.key));
				}
			}
		}

		// The code below should only work if the popup is showing.
		if (!isPopupVisible) return;

		// Loop the icons using "Tab"
		if (ev.key === "Tab")
		{
			const firstIcon = popup.enginesContainer.firstChild as HTMLImageElement;
			const lastIcon = popup.enginesContainer.lastChild as HTMLImageElement;

			// Focus the first icon for the first time, as well as after the last one so as to keep looping them.
			if (document.activeElement.nodeName !== "SSS-POPUP" || ev.originalTarget === lastIcon) {
				firstIcon.focus();
				ev.preventDefault();
				return;
			}
		}

		// if pressing the enter key
		if (ev.keyCode == 13 && popup.isReceiverOfEvent(ev))
		{
			let engine;
			let openingBehaviour;

			// if we're inside the popup's text field, grab the first user-defined engine and search using that
			if (ev.originalTarget.nodeName === "INPUT") {
				engine = settings.searchEngines.find(e => e.type !== SSS.SearchEngineType.SSS);
				openingBehaviour = SSS.OpenResultBehaviour.NewBgTab;	// for now, using enter is the same as ctrl-clicking
			} else {
				// if cycling the icons using "tab", grab the focused icon
				const engineIndex = [...popup.enginesContainer.children].indexOf(ev.originalTarget);
				engine = settings.searchEngines[engineIndex];
				openingBehaviour = settings.shortcutBehaviour;
			}

			const message = createSearchMessage(engine, settings);
			message.openingBehaviour = openingBehaviour;
			browser.runtime.sendMessage(message);
		}
		else
		{
			maybeHidePopup(ev);
		}
	}

	function searchWithEngineUsingShortcut(key: string)
	{
		const engine = getEngineWithShortcut(key);
		if (engine) {
			const message = createSearchMessage(engine, settings);
			message.openingBehaviour = settings.shortcutBehaviour;
			browser.runtime.sendMessage(message);
		}
	}

	function maybeHidePopup(ev?)
	{
		if (popup === null) return;

		if (ev)
		{
			if (ev.type === "keydown")
			{
				// these keys shouldn't hide the popup
				if (ev.keyCode == 16) return;	// shift
				if (ev.keyCode == 17) return;	// ctrl
				if (ev.keyCode == 18) return;	// alt
				if (ev.keyCode == 224) return;	// mac cmd (224 only on Firefox)

				if (ev.keyCode == 27) {	// escape forces hide
					popup.hide();
					return;
				}

				// if event is a keydown on the text field, don't hide
				if (popup.isReceiverOfEvent(ev)) return;

				// Pressing a shortcut key should be treated as a click to an icon.
				// So we should only hide the popup when the user presses a shortcut key if
				// hidePopupOnSearch is true.
				if (!settings.hidePopupOnSearch && getEngineWithShortcut(ev.key)) return;
			}

			// if we pressed with right mouse button and that isn't supposed to hide the popup, don't hide
			if (ev.button === 2 && settings && settings.hidePopupOnRightClick === false) return;
		}

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
			// If we hide the popup *immediately* and this is a right click,
			// it will consequently be detected on whatever's behind the popup
			// and call the context menu, which we don't want.
			setTimeout(() => maybeHidePopup(), 0);
		}

		if (ev.button === 0 || ev.button === 1 || ev.button === 2)
		{
			const message: EngineClickMessage = createSearchMessage(engine, settings);

			if (ev[selectionchange.modifierKey]) {
				message.openingBehaviour = SSS.OpenResultBehaviour.NewBgTab;
			} else if (ev.button === 0) {
				message.openingBehaviour = settings.mouseLeftButtonBehaviour;
			} else if (ev.button === 1) {
				message.openingBehaviour = settings.mouseMiddleButtonBehaviour;
			} else {
				message.openingBehaviour = settings.mouseRightButtonBehaviour;
			}

			browser.runtime.sendMessage(message);
		}
	}

	function createSearchMessage(engine: SSS.SearchEngine, settings: SSS.Settings): EngineClickMessage
	{
		const message = new EngineClickMessage();
		// Due to shortcuts, we can search without a popup, so we only get the input field contents if popup is not null.
		message.selection = popup !== null && settings.showSelectionTextField === true ? popup.getInputFieldText() : selection.text;
		message.engine = engine;

		if (window.location) {
			message.href = window.location.href;
		}

		return message;
	}

	function onMouseDown(ev: MouseEvent)
	{
		if (ev.button !== 1) return;

		const selection: Selection = window.getSelection();

		// for selections inside editable elements
		const elem: Element = document.activeElement;

		if (elem instanceof HTMLTextAreaElement || (elem instanceof HTMLInputElement && elem.type !== "password")) {
			if (forceSelectionIfWithinRect(ev, elem.getBoundingClientRect())) {
				return false;
			}
		}

		// for normal text selections
		for (let i = 0; i < selection.rangeCount; ++i)
		{
			const range: Range = selection.getRangeAt(i); // get the text range
			const bounds: ClientRect | DOMRect = range.getBoundingClientRect();
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
		const margin = activationSettings.middleMouseSelectionClickMargin;

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

			const shadowRoot = this.attachShadow({mode: "closed"});

			const css = this.generateStylesheet(settings);
			var style = document.createElement("style");
			style.appendChild(document.createTextNode(css));
			shadowRoot.appendChild(style);

			// create popup parent (will contain all icons)
			this.content = document.createElement("div");
			this.content.classList.add("sss-content");
			shadowRoot.appendChild(this.content);

			if (settings.showSelectionTextField)
			{
				this.inputField = document.createElement("input");
				this.inputField.type = "text";
				this.inputField.classList.add("sss-input-field");
				this.content.appendChild(this.inputField);
			}

			if (this.inputField && settings.selectionTextFieldLocation === SSS.SelectionTextFieldLocation.Top) {
				this.content.appendChild(this.inputField);
			}

			this.enginesContainer = document.createElement("div");
			this.enginesContainer.classList.add("sss-engines");
			this.content.appendChild(this.enginesContainer);

			if (this.inputField && settings.selectionTextFieldLocation === SSS.SelectionTextFieldLocation.Bottom) {
				this.content.appendChild(this.inputField);
			}

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
					-moz-user-select: none;
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

				${settings.useCustomPopupCSS === true ? settings.customPopupCSS : ""}
			`;
		}

		generateStylesheet_TextAlign(settings: SSS.Settings): string
		{
			let textAlign: string = "center";

			if (!settings.useSingleRow)
			{
				switch (settings.iconAlignmentInGrid) {
					case SSS.IconAlignment.Left: textAlign = "left"; break;
					case SSS.IconAlignment.Right: textAlign = "right"; break;
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
				const nSeparators = settings.searchEngines.filter(e => e.type === SSS.SearchEngineType.SSS && (e as SSS.SearchEngine_SSS).id === "separator").length;
				const nPopupIcons: number = settings.searchEngines.length - nSeparators;
				width = nPopupIcons * (settings.popupItemSize + 2 * settings.popupItemPadding);
				width += nSeparators * (settings.popupItemSize * settings.popupSeparatorWidth / 100 + 2 * settings.popupItemPadding);
			}
			else
			{
				const nPopupIconsPerRow: number = Math.max(1, Math.min(settings.nPopupIconsPerRow, settings.searchEngines.length));
				width = nPopupIconsPerRow * (settings.popupItemSize + 2 * settings.popupItemPadding);
			}

			return `width: ${width}px;`;
		}

		generateStylesheet_IconHover(settings: SSS.Settings): string
		{
			if (settings.popupItemHoverBehaviour === SSS.ItemHoverBehaviour.Highlight
			 || settings.popupItemHoverBehaviour === SSS.ItemHoverBehaviour.HighlightAndMove)
			{
				let borderCompensation;
				if (settings.popupItemHoverBehaviour === SSS.ItemHoverBehaviour.HighlightAndMove) {
					const marginTopValue = Math.min(-3 - settings.popupItemVerticalPadding + 2, -2);	// equal or less than -2 to counter the border's 2px
					borderCompensation = `margin-top: ${marginTopValue}px;`;
				} else {
					const paddingBottomValue = Math.max(3 + settings.popupItemVerticalPadding - 2, 0);	// must be positive to counter the border's 2px
					borderCompensation = `padding-bottom: ${paddingBottomValue}px;`;
				}

				return `
					border-bottom: 2px ${settings.popupHighlightColor} solid;
					border-radius: ${settings.popupItemBorderRadius == 0 ? 2 : settings.popupItemBorderRadius}px;
					${borderCompensation}
				`;
			}
			else if (settings.popupItemHoverBehaviour === SSS.ItemHoverBehaviour.Scale)
			{
				// "backface-visibility: hidden" prevents blurriness
				return `
					transform: scale(1.15);
					backface-visibility: hidden;
				`;
			}

			return "";
		}

		generateStylesheet_Separator(settings: SSS.Settings): string
		{
			const separatorWidth = settings.popupItemSize * settings.popupSeparatorWidth / 100;
			const separatorMargin = (separatorWidth - settings.popupItemSize) / 2;

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
				const engine = settings.searchEngines[i];
				let icon: HTMLImageElement;

				// special SSS icons with special functions
				if (engine.type === SSS.SearchEngineType.SSS)
				{
					const sssEngine = engine as SSS.SearchEngine_SSS;
					const sssIcon = sssIcons[sssEngine.id];

					const iconImgSource = browser.extension.getURL(sssIcon.iconPath);
					const isInteractive = sssIcon.isInteractive !== false;	// undefined or true means it's interactive
					icon = this.setupEngineIcon(sssEngine, iconImgSource, sssIcon.name, isInteractive, settings);

					if (sssEngine.id === "separator") {
						icon.classList.add("separator");
					}
				}
				// "normal" custom search engines
				else
				{
					const userEngine = engine as SSS.SearchEngine_NonSSS;
					let iconImgSource: string;

					if (userEngine.iconUrl.startsWith("data:")) {
						iconImgSource = userEngine.iconUrl;	// use "URL" directly, as it's pure image data
					} else {
						const cachedIcon = settings.searchEnginesCache[userEngine.iconUrl];
						iconImgSource = cachedIcon ? cachedIcon : userEngine.iconUrl;	// should have cached icon, but if not (for some reason) fall back to URL
					}

					icon = this.setupEngineIcon(userEngine, iconImgSource, userEngine.name, true, settings);
				}

				this.enginesContainer.appendChild(icon);
			}
		}

		setupEngineIcon(engine: SSS.SearchEngine, iconImgSource: string, iconTitle: string, isInteractive: boolean, settings: SSS.Settings): HTMLImageElement
		{
			const icon: HTMLImageElement = document.createElement("img");
			icon.src = iconImgSource;
			icon.tabIndex = 0; // to allow cycling through the icons using "tab"

			// if icon responds to mouse interaction
			if (isInteractive) {
				icon.title = engine.shortcut ? `${iconTitle} (${engine.shortcut})` : iconTitle;	// tooltip
				icon.addEventListener("mouseup", ev => onSearchEngineClick(ev, engine, settings)); // "mouse up" instead of "click" to support middle click
				// prevent context menu since icons have a right click behaviour
				icon.addEventListener("contextmenu", ev => {
					ev.preventDefault();
					return false;
				});
			}

			// prevents focus from changing to icon and breaking copy from input fields
			icon.addEventListener("mousedown", ev => ev.preventDefault());
			// disable dragging popup images
			icon.ondragstart = _ => false;

			return icon;
		}

		setPopupPosition(settings: SSS.Settings, selection: ContentScript.SelectionData, mousePositionX: number, mousePositionY: number)
		{
			const bounds = this.content.getBoundingClientRect();
			const width = bounds.width;
			const height = bounds.height;

			// position popup

			let positionLeft: number;
			let positionTop: number;

			// decide popup position based on settings
			if (settings.popupLocation === SSS.PopupLocation.Selection) {
				let rect;
				if (selection.isInInputField) {
					rect = selection.element.getBoundingClientRect();
				} else {
					const range = selection.selection.getRangeAt(0); // get the text range
					rect = range.getBoundingClientRect();
				}
				// lower right corner of selected text's "bounds"
				positionLeft = rect.right + window.pageXOffset;
				positionTop = rect.bottom + window.pageYOffset;
			}
			else if (settings.popupLocation === SSS.PopupLocation.Cursor) {
				// right above the mouse position
				positionLeft = mousePositionX;
				positionTop = mousePositionY - height - 10;	// 10 is forced padding to avoid popup being too close to cursor
			}

			// center horizontally
			positionLeft -= width / 2;

			// apply user offsets from settings
			positionLeft += settings.popupOffsetX;
			positionTop -= settings.popupOffsetY;	// invert sign because y is 0 at the top

			// don't const popup be outside of the viewport

			const margin: number = 5;

			// left/right checks
			if (positionLeft < margin + window.scrollX) {
				positionLeft = margin + window.scrollX;
			} else {
				const clientWidth = Math.max(document.body.clientWidth, document.documentElement.clientWidth);
				if (positionLeft + width + margin > clientWidth + window.scrollX) {
					positionLeft = clientWidth + window.scrollX - width - margin;
				}
			}

			// top/bottom checks
			if (positionTop < margin + window.scrollY) {
				positionTop = margin + window.scrollY;
			} else {
				const clientHeight = Math.max(document.body.clientHeight, document.documentElement.clientHeight);
				if (positionTop + height + margin > clientHeight + window.scrollY) {
					positionTop = clientHeight + window.scrollY - height - margin;
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

		setFocusOnInputFieldText()
		{
			this.inputField.focus();
		}

		setInputFieldText(text: string)
		{
			this.inputField.value = text;
		}

		getInputFieldText(): string
		{
			return this.inputField.value;
		}

		isShown(): boolean
		{
			return this.content.style.display === "inline-block";
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
