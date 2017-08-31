/* ==================================== */
/* ====== Swift Selection Search ====== */
/* ==================================== */

"use strict";

const consts = {
	ShowIconInPanel_Off: "0",
	ShowIconInPanel_Show: "1",
	ShowIconInPanel_ShowAtEnd: "2",

	PopupOpenBehaviour_Off: "0",
	PopupOpenBehaviour_Auto: "1",
	PopupOpenBehaviour_Keyboard: "2",

	PopupLocation_Selection: "0",
	PopupLocation_Cursor: "1",

	MouseButtonBehaviour_ThisTab: "0",
	MouseButtonBehaviour_NewTab: "1",
	MouseButtonBehaviour_NewBgTab: "2",
	MouseButtonBehaviour_NewTabNextToThis: "3",
	MouseButtonBehaviour_NewBgTabNextToThis: "4",

	AutoCopyToClipboard_Off: "0",
	AutoCopyToClipboard_Always: "1",

	ItemHoverBehaviour_Nothing: "0",
	ItemHoverBehaviour_Highlight: "1",
	ItemHoverBehaviour_HighlightAndMove: "2",

	ContextMenuEnginesFilter_All: "0",
	ContextMenuEnginesFilter_SameAsPopupPanel: "1",

	sssIcons: {
		copyToClipboard: {
			name: "Copy to clipboard",
			description: 'Adds a "Copy selection to clipboard" icon to the panel.',
			iconUrl: "data/icons/sss-icon-copy.svg",
		},
		openAsLink: {
			name: "Open as link",
			description: 'Adds an "Open selection as link" icon to the panel.',
			iconUrl: "data/icons/sss-icon-open-link.svg",
		}
	}
};

const defaultSettings = {
	doShowCopyIconInPanel: consts.ShowIconInPanel_Off,
	doShowOpenLinkIconInPanel: consts.ShowIconInPanel_Off,
	popupPanelOpenBehaviour: consts.PopupOpenBehaviour_Auto,
	popupLocation: consts.PopupLocation_Cursor,
	hidePopupPanelOnPageScroll: true,
	hidePopupPanelOnSearch: true,
	popupPanelHotkey: "accel-shift-space",
	popupPanelDisableHotkey: "accel-shift-x",
	mouseLeftButtonBehaviour: consts.MouseButtonBehaviour_ThisTab,
	mouseMiddleButtonBehaviour: consts.MouseButtonBehaviour_NewBgTab,
	popupPanelAnimationDuration: 200,
	autoCopyToClipboard: consts.AutoCopyToClipboard_Off,
	useSingleRow: true,
	nItemsPerRow: 4,
	itemSize: 24,
	itemPadding: 2,
	itemHoverBehaviour: consts.ItemHoverBehaviour_HighlightAndMove,
	popupPanelBackgroundColor: "#FFFFFF",
	popupPanelHighlightColor: "#3366FF",
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
			iconUrl: "http://iconshow.me/media/images/social/simple-icons/png/32/google.png",
			searchUrl: "https://www.google.pt/search?q={searchText}",
			isEnabled: true,
		},
		{
			type: "custom",
			name: "YouTube",
			iconUrl: "https://www.youtube.com/yts/img/favicon_32-vfl8NGn4k.png",
			searchUrl: "https://www.youtube.com/results?search_query={searchText}",
			isEnabled: true,
		},
		{
			type: "custom",
			name: "IMDB",
			iconUrl: "https://cdn4.iconfinder.com/data/icons/Classy_Social_Media_Icons/32/imdb.png",
			searchUrl: "http://www.imdb.com/find?s=all&q={searchText}",
			isEnabled: true,
		},
		{
			type: "custom",
			name: "Wikipedia",
			iconUrl: "http://findicons.com/files/icons/111/popular_sites/128/wikipedia_icon.png",
			searchUrl: "https://en.wikipedia.org/wiki/Special:Search?search={searchText}",
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
			isEnabled: false,
		}
	]
};

let sss = {};

// clear all settings (for test purposes)
// browser.storage.local.clear();

// Get settings. Setup happens when they are ready.
browser.storage.local.get().then(setup_SSS, getErrorHandler("Error getting settings for setup."));

/* ------------------------------------ */
/* -------------- SETUP --------------- */
/* ------------------------------------ */

// Main SSS setup. Called when settings are acquired. Prepares everything.
function setup_SSS(settings)
{
	// if settings object is empty, use defaults
	if (settings === undefined || Object.keys(settings).length === 0) {
		console.log("Empty settings! Using defaults.");
		settings = Object.assign({}, defaultSettings);
		browser.storage.local.set(settings);
	}

	sss.settings = settings;

	console.log("loading ", settings);

	generateEngineObjects();

	setup_ContextMenu();
	setup_PopupHotkeys();
	setup_Popup();

	if (!browser.runtime.onMessage.hasListener(onContentScriptMessage)) {
		browser.runtime.onMessage.addListener(onContentScriptMessage);
	}

	if (!browser.storage.onChanged.hasListener(onSettingsChanged)) {
		browser.storage.onChanged.addListener(onSettingsChanged);
	}

	console.log("Swift Selection Search has started!");
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
	browser.storage.local.get().then(setup_SSS, getErrorHandler("Error getting settings after onSettingsChanged."));
}

function getErrorHandler(text)
{
	return error => console.log(`${text} (${error})`);
}

function onContentScriptMessage(msg, sender, responseCallback)
{
	if (msg.type !== "log") {
		console.log("msg.type: " + msg.type);
	}

	if (msg.type === "activation") {
		responseCallback({ settings: sss.settings, engineObjects: sss.engineObjects });
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

	if (sss.settings.popupPanelOpenBehaviour !== consts.PopupOpenBehaviour_Off) {
		browser.commands.onCommand.addListener(onHotkey);
	}
}

function onHotkey(command)
{
	if (command == "open-popup") {
		// sss.activeWorker.port.emit("showPopup", sss.settings, sss.engineObjects);
	} else if(command == "toggle-auto-popup") {
		// toggles value between Auto and Keyboard
		if (sss.settings.popupPanelOpenBehaviour === consts.PopupOpenBehaviour_Auto) {
			sss.settings.popupPanelOpenBehaviour = consts.PopupOpenBehaviour_Keyboard;
		} else if (sss.settings.popupPanelOpenBehaviour === consts.PopupOpenBehaviour_Keyboard) {
			sss.settings.popupPanelOpenBehaviour = consts.PopupOpenBehaviour_Auto;
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

	if (sss.settings.popupPanelOpenBehaviour !== consts.PopupOpenBehaviour_Off) {
		browser.tabs.onActivated.addListener(onTabActivated);
		browser.tabs.onUpdated.addListener(onTabUpdated);
	}
}

function onTabActivated(activeInfo)
{
	// activeInfo.tabId
	injectPageWorker();
}

function onTabUpdated(tabId, changeInfo, tab)
{
	if (changeInfo.status === "complete") {
		injectPageWorker();
	}
}

function injectPageWorker()
{
	browser.tabs.executeScript({ file: "/content-scripts/selectionchange.js" }).then(
		result => browser.tabs.executeScript({ file: "/content-scripts/selection-worker.js" }).then(
			null, getErrorHandler("Error executing page worker script.")),
		getErrorHandler("Error executing selectionchange.js script."));
}

// creates engine objects to be passed to page workers (must be convertible to JSON)
function generateEngineObjects()
{
	sss.engineObjects = sss.settings.searchEngines
		.filter(engine => engine.isEnabled)
		.map(engine => {
			if (engine.type === "sss") {
				let sssIcon = consts.sssIcons[engine.id];
				return {
					type: engine.type,
					id: engine.id,
					name: sssIcon.name,
					iconUrl: browser.extension.getURL(sssIcon.iconUrl)
				};
			} else {
				return {
					type: engine.type,
					name: engine.name,
					iconUrl: engine.iconUrl
				};
			}
		});
}

function onSearchEngineClick(searchText, engineObject, clickType)
{
	if (engineObject.type === "sss") {
		if (engineObject.id === "copyToClipboard") {
			getCurrentTab(tab => browser.tabs.sendMessage(tab.id, { type: "copyToClipboard" }));
		} else if (engineObject.id == "openAsLink") {
			if (clickType === "leftClick") {
				openUrl(searchText, sss.settings.mouseLeftButtonBehaviour);
			} else if (clickType === "middleClick") {
				openUrl(searchText, sss.settings.mouseMiddleButtonBehaviour);
			} else if (clickType === "ctrlClick") {
				openUrl(searchText, "2");
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
	return engine.searchUrl.replace("{searchText}", encodeURIComponent(searchText));
}

function openUrl(urlToOpen, openingBehaviour)
{
	switch (openingBehaviour)
	{
		case "0": browser.tabs.update({ url: urlToOpen }); break;
		case "1": browser.tabs.create({ url: urlToOpen }); break;
		case "2": browser.tabs.create({ url: urlToOpen, active: false }); break;
		case "3": getCurrentTab(tab => browser.tabs.create({ url: urlToOpen, index: tab.index+1 })); break;
		case "4": getCurrentTab(tab => browser.tabs.create({ url: urlToOpen, index: tab.index+1, active: false })); break;
	}
}

function getCurrentTab(callback)
{
	browser.tabs.query({currentWindow: true, active: true})
		.then(function(tabs) {
			callback(tabs[0]);
		}, getErrorHandler("Error getting current tab."));
}

/* ------------------------------------ */
/* ------------------------------------ */
/* ------------------------------------ */
