/* ==================================== */
/* ====== Swift Selection Search ====== */
/* ==================================== */

"use strict";

const consts = {
	PopupOpenBehaviour_Off: "off",
	PopupOpenBehaviour_Auto: "auto",
	PopupOpenBehaviour_Keyboard: "keyboard",

	PopupLocation_Selection: "selection",
	PopupLocation_Cursor: "cursor",

	MouseButtonBehaviour_ThisTab: "this-tab",
	MouseButtonBehaviour_NewTab: "new-tab",
	MouseButtonBehaviour_NewBgTab: "new-bg-tab",
	MouseButtonBehaviour_NewTabNextToThis: "new-tab-next",
	MouseButtonBehaviour_NewBgTabNextToThis: "new-bg-tab-next",

	AutoCopyToClipboard_Off: "off",
	AutoCopyToClipboard_Always: "always",

	ItemHoverBehaviour_Nothing: "nothing",
	ItemHoverBehaviour_Highlight: "highlight",
	ItemHoverBehaviour_HighlightAndMove: "highlight-and-move",

	ContextMenuEnginesFilter_All: "all",
	ContextMenuEnginesFilter_SameAsPopupPanel: "same-as-popup",

	sssIcons: {
		copyToClipboard: {
			name: "Copy to clipboard",
			description: '[SSS] Adds a "Copy selection to clipboard" icon to the panel.',
			iconPath: "res/sss-engine-icons/copy.svg",
		},
		openAsLink: {
			name: "Open as link",
			description: '[SSS] Adds an "Open selection as link" icon to the panel.',
			iconPath: "res/sss-engine-icons/open-link.svg",
		}
	}
};

const defaultSettings = {
	popupOpenBehaviour: consts.PopupOpenBehaviour_Auto,
	popupLocation: consts.PopupLocation_Cursor,
	hidePopupOnPageScroll: true,
	hidePopupOnSearch: true,
	popupOpenHotkey: "accel-shift-space",
	popupDisableHotkey: "accel-shift-x",
	mouseLeftButtonBehaviour: consts.MouseButtonBehaviour_ThisTab,
	mouseMiddleButtonBehaviour: consts.MouseButtonBehaviour_NewBgTab,
	popupAnimationDuration: 200,
	autoCopyToClipboard: consts.AutoCopyToClipboard_Off,
	useSingleRow: true,
	nPopupIconsPerRow: 4,
	popupItemSize: 24,
	popupItemPadding: 2,
	popupItemHoverBehaviour: consts.ItemHoverBehaviour_HighlightAndMove,
	popupBackgroundColor: "#FFFFFF",
	popupHighlightColor: "#3399FF",
	popupPaddingX: 3,
	popupPaddingY: 1,
	popupOffsetX: 0,
	popupOffsetY: 0,
	enableEnginesInContextMenu: true,
	contextMenuItemBehaviour: consts.MouseButtonBehaviour_NewBgTab,
	contextMenuEnginesFilter: consts.ContextMenuEnginesFilter_All,

	searchEngines: [
		{
			type: "custom",
			name: "Google",
			iconUrl: "https://www.google.com/favicon.ico",
			iconSrc: "",
			searchUrl: "https://www.google.com/search?q={searchTerms}",
			isEnabled: true,
		},
		{
			type: "custom",
			name: "YouTube",
			iconUrl: "https://www.youtube.com/yts/img/favicon_144-vfliLAfaB.png",
			iconSrc: "",
			searchUrl: "https://www.youtube.com/results?search_query={searchTerms}",
			isEnabled: true,
		},
		{
			type: "custom",
			name: "IMDB",
			iconUrl: "https://www.imdb.com/favicon.ico",
			iconSrc: "",
			searchUrl: "http://www.imdb.com/find?s=all&q={searchTerms}",
			isEnabled: true,
		},
		{
			type: "custom",
			name: "Wikipedia (en)",
			iconUrl: "https://www.wikipedia.org/favicon.ico",
			iconSrc: "",
			searchUrl: "https://en.wikipedia.org/wiki/Special:Search?search={searchTerms}",
			isEnabled: true,
		},
		{
			type: "sss",
			id: "copyToClipboard",
			isEnabled: true,
		},
		{
			type: "sss",
			id: "openAsLink",
			isEnabled: true,
		}
	]
};

// show message related to update to WebExtensions
browser.runtime.onInstalled.addListener(function(details)
{
	if (details.reason == "install"
	|| (details.reason == "update" && !details.previousVersion.startsWith("3.")))
	{
		browser.tabs.create({ url : "/res/msg-pages/update-to-webextensions.html" });
	}
});

let isFirstLoad = true;
let sss = {};

// clear all settings (for test purposes)
// browser.storage.local.clear();

// register with worker messages and changes to settings
browser.runtime.onMessage.addListener(onContentScriptMessage);
browser.storage.onChanged.addListener(onSettingsChanged);

// Get settings. Setup happens when they are ready.
browser.storage.local.get().then(onSettingsAcquired, getErrorHandler("Error getting settings for setup."));

/* ------------------------------------ */
/* -------------- SETUP --------------- */
/* ------------------------------------ */

// Main SSS setup. Called when settings are acquired. Prepares everything.
function onSettingsAcquired(settings)
{
	// if settings object is empty, use defaults
	if (settings === undefined || Object.keys(settings).length === 0) {
		console.log("Empty settings! Using defaults.");
		settings = Object.assign({}, defaultSettings);
		browser.storage.local.set(settings);
	}

	sss.settings = settings;

	if (isFirstLoad) {
		console.log("loading ", settings);
	}

	setup_ContextMenu();
	setup_PopupHotkeys();
	setup_Popup();

	if (isFirstLoad) {
		console.log("Swift Selection Search has started!");
	}

	isFirstLoad = false;
}

// Called from settings.
function getDefaultSettings()
{
	return defaultSettings;
}

// Called from settings.
function getSssIcon(id)
{
	return consts.sssIcons[id];
}

function onSettingsChanged(changes, area)
{
	if (area !== "local" || Object.keys(changes).length === 0) {
		return;
	}

	console.log("onSettingsChanged");
	console.log(changes);
	console.log(area);
	browser.storage.local.get().then(onSettingsAcquired, getErrorHandler("Error getting settings after onSettingsChanged."));
}

function getErrorHandler(text)
{
	return error => console.log(`${text} (${error})`);
}

function onContentScriptMessage(msg, sender, sendResponse)
{
	if (msg.type !== "log") {
		console.log("msg.type: " + msg.type);
	}

	if (msg.type === "activationRequest") {
		sendResponse({ popupLocation: sss.settings.popupLocation, popupOpenBehaviour: sss.settings.popupOpenBehaviour });
	} else if (msg.type === "engineClick") {
		onSearchEngineClick(msg.selection, msg.engine, msg.clickType);
	} else if (msg.type === "log") {
		console.log("[content script console.log]", msg.log);
	}
}

/* ------------------------------------ */
/* ----------- CONTEXT MENU ----------- */
/* ------------------------------------ */

function setup_ContextMenu()
{
	browser.contextMenus.onClicked.removeListener(onContextMenuItemClicked);
	browser.contextMenus.removeAll();

	if (sss.settings.enableEnginesInContextMenu !== true) {
		return;
	}

	let engines = sss.settings.searchEngines.filter(engine => engine.type !== "sss");

	if (sss.settings.contextMenuEnginesFilter === consts.ContextMenuEnginesFilter_SameAsPopupPanel) {
		engines = engines.filter(engine => engine.isEnabled);
	}

	for (let engine of engines)
	{
		browser.contextMenus.create({
			id: engine.name,
			title: engine.name,
			contexts: ["selection"]
		});
	}

	browser.contextMenus.onClicked.addListener(onContextMenuItemClicked);
}

function onContextMenuItemClicked(info, tab)
{
	let engine = sss.settings.searchEngines.find(engine => engine.name === info.menuItemId);
	if (engine !== undefined) {
		let searchUrl = getSearchQuery(engine, info.selectionText);
		openUrl(searchUrl, sss.settings.contextMenuItemBehaviour);
	}
}

/* ------------------------------------ */
/* ------------ SHORTCUTS ------------- */
/* ------------------------------------ */

function setup_PopupHotkeys()
{
	// clear any old registrations
	if (browser.commands.onCommand.hasListener(onHotkey)) {
		browser.commands.onCommand.removeListener(onHotkey);
	}

	if (sss.settings.popupOpenBehaviour !== consts.PopupOpenBehaviour_Off) {
		browser.commands.onCommand.addListener(onHotkey);
	}
}

function onHotkey(command)
{
	if (command === "open-popup") {
		getCurrentTab(tab => browser.tabs.sendMessage(tab.id, { type: "showPopup" }));
	} else if (command === "toggle-auto-popup") {
		// toggles value between Auto and Keyboard
		if (sss.settings.popupOpenBehaviour === consts.PopupOpenBehaviour_Auto) {
			sss.settings.popupOpenBehaviour = consts.PopupOpenBehaviour_Keyboard;
		} else if (sss.settings.popupOpenBehaviour === consts.PopupOpenBehaviour_Keyboard) {
			sss.settings.popupOpenBehaviour = consts.PopupOpenBehaviour_Auto;
		}
	}
}

/* ------------------------------------ */
/* -------------- POPUP --------------- */
/* ------------------------------------ */

function setup_Popup()
{
	browser.tabs.onActivated.removeListener(onTabActivated);
	browser.tabs.onUpdated.removeListener(onTabUpdated);

	if (sss.settings.popupOpenBehaviour !== consts.PopupOpenBehaviour_Off) {
		browser.tabs.onActivated.addListener(onTabActivated);
		browser.tabs.onUpdated.addListener(onTabUpdated);
	}
}

function onTabActivated(activeInfo)
{
	// console.log("onTabActivated " + activeInfo.tabId);
	// injectPageWorker(activeInfo.tabId);
}

function onTabUpdated(tabId, changeInfo, tab)
{
	// console.log("onTabUpdated " + changeInfo.status + " "+ tabId);
	if (changeInfo.status === "complete") {
		injectPageWorker(tabId);
	}
}

function injectPageWorker(tabId)
{
	// try sending message to see if worker exists. if it errors then inject it
	browser.tabs.sendMessage(tabId, { type: "isAlive" }).then(
		_ => {},
		_ => {
			console.log("injectPageWorker "+ tabId);

			browser.tabs.executeScript(tabId, { file: "/content-scripts/selectionchange.js" }).then(
			result => browser.tabs.executeScript(tabId, { file: "/content-scripts/page-script.js" }).then(
				null,
				getErrorHandler("Error executing page worker script.")
			),
			getErrorHandler("Error executing selectionchange.js script."));
		}
	);
}

function onSearchEngineClick(searchText, engineObject, clickType)
{
	if (engineObject.type === "sss") {
		if (engineObject.id === "copyToClipboard") {
			getCurrentTab(tab => browser.tabs.sendMessage(tab.id, { type: "copyToClipboard" }));
		} else if (engineObject.id === "openAsLink") {
			if (clickType === "leftClick") {
				openUrl(searchText, sss.settings.mouseLeftButtonBehaviour);
			} else if (clickType === "middleClick") {
				openUrl(searchText, sss.settings.mouseMiddleButtonBehaviour);
			} else if (clickType === "ctrlClick") {
				openUrl(searchText, consts.MouseButtonBehaviour_NewBgTab);
			}
		}
	} else {
		let engine = sss.settings.searchEngines.find(engine => engine.name === engineObject.name);

		if (clickType === "leftClick") {
			openUrl(getSearchQuery(engine, searchText), sss.settings.mouseLeftButtonBehaviour);
		} else if (clickType === "middleClick") {
			openUrl(getSearchQuery(engine, searchText), sss.settings.mouseMiddleButtonBehaviour);
		} else if (clickType === "ctrlClick") {
			openUrl(getSearchQuery(engine, searchText), consts.MouseButtonBehaviour_NewBgTab);
		}
	}
}

function getSearchQuery(engine, searchText)
{
	return engine.searchUrl.replace("{searchTerms}", encodeURIComponent(searchText));
}

function openUrl(urlToOpen, openingBehaviour)
{
	switch (openingBehaviour)
	{
		case consts.MouseButtonBehaviour_ThisTab:            browser.tabs.update({ url: urlToOpen }); break;
		case consts.MouseButtonBehaviour_NewTab:             browser.tabs.create({ url: urlToOpen }); break;
		case consts.MouseButtonBehaviour_NewBgTab:           browser.tabs.create({ url: urlToOpen, active: false }); break;
		case consts.MouseButtonBehaviour_NewTabNextToThis:   getCurrentTab(tab => browser.tabs.create({ url: urlToOpen, index: tab.index+1 })); break;
		case consts.MouseButtonBehaviour_NewBgTabNextToThis: getCurrentTab(tab => browser.tabs.create({ url: urlToOpen, index: tab.index+1, active: false })); break;
	}
}

function getCurrentTab(callback)
{
	browser.tabs.query({currentWindow: true, active: true}).then(
		tabs => callback(tabs[0]),
		getErrorHandler("Error getting current tab.")
	);
}

/* ------------------------------------ */
/* ------------------------------------ */
/* ------------------------------------ */
