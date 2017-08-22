/* ==================================== */
/* ====== Swift Selection Search ====== */
/* ==================================== */

"use strict";

let sss = {};

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
};

// Get settings. Setup happens when they are ready.
browser.storage.local.get().then(setup_SSS, handleError);

// Main SSS setup. Called when settings are acquired. Prepares everything.
function setup_SSS(settings)
{
	// if settings object is empty, use defaults
	if (settings === undefined || Object.keys(settings).length === 0) {
		settings = Object.assign({}, defaultSettings);
	}

	console.log(settings);

	sss.settings = settings;
	sss.settings.selectedSearchEngines = {
		"Google": true,
		"YouTube": true,
		"IMDB": true,
		"Wikipedia": true,
	};

	if (sss.settings.selectedSearchEngines) {
		// cleanup any deleted engines...
		purgeNonExistentEngines();
	} else {
		// ...or just create the known engines list if this is the first time
		sss.settings.selectedSearchEngines = {};
	}

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

function onSettingsChanged(changes, area)
{
	if (area !== "local") {
		return;
	}
	setup_SSS();
}

function handleError(error)
{
	console.log(error);
}

function onContentScriptMessage(msg, sender, responseFunc)
{
	if (msg.type !== "log") {
		console.log("msg.type: " + msg.type);
	}

	if (msg.type === "activation") {
		responseFunc({ settings: sss.settings, engineObjs: sss.selectedEngineObjs });
	} else if (msg.type === "textSelection") {
		console.log("text selected! " + msg.text);
	} else if (msg.type === "engineClick") {
		onSearchEngineClick(msg.selection, msg.engine, msg.clickType);
	} else if (msg.type === "log") {
		if (typeof msg.log === "object") {
			console.log("content script console.log:");
			console.log(msg.log);
		} else {
			console.log("content script console.log: " + msg.log);
		}
	}
}

/* ------------------------------------ */
/* ------------- SETTINGS ------------- */
/* ------------------------------------ */

// function onSettingsChanged(changes, area)
// {
// 	if (area !== "local") {
// 		return;
// 	}

// 	setup_SSS();

// 	browser.storage.local.get().then(saveReferenceToCurrentSettings, handleError);

// 	// any change should destroy any active popup and force the options to be recreated next time they're needed
// 	generateEngineObjects();

// 	for (let item of Object.keys(changes))
// 	{
// 		if (item === "popupPanelOpenBehaviour") {
// 			setupPopupPageMod();
// 		}
// 		else if (item === "popupPanelHotkey" || item === "popupPanelDisableHotkey") {
// 			setup_PopupHotkeys();
// 		}
// 		else if (item === "searchEngines"
// 			  || item === "enableEnginesInContextMenu"
// 			  || item === "contextMenuEnginesFilter") {
// 			setup_ContextMenu();
// 		}
// 		// console.log(changes[item].oldValue);
// 		// console.log(changes[item].newValue);
// 	}
// }

// function saveReferenceToCurrentSettings(settings)
// {
// 	sss.settings = settings;
// 	sss.settings.selectedSearchEngines = {
// 		"Google": true,
// 		"YouTube": true,
// 		"IMDB": true,
// 		"Wikipedia": true,
// 	};
// }

function isEngineSelected(engine)
{
	// if engine is not yet known by SSS, add it and default to false so it is not added to popup
	if (!sss.settings.selectedSearchEngines.hasOwnProperty(engine.name)) {
		sss.settings.selectedSearchEngines[engine.name] = false;
	}
	return sss.settings.selectedSearchEngines[engine.name];
}

// removes engines that SSS had knowledge of but were since deleted
function purgeNonExistentEngines()
{
	let visibleEngineNames = getVisibleEngines().map(function(engine) { return engine.name; });

	for (let engineName in sss.settings.selectedSearchEngines) {
		if (visibleEngineNames.indexOf(engineName) === -1) {
			delete sss.settings.selectedSearchEngines[engineName];
		}
	}
}

function getVisibleEngines()
{
	return [
		{
			name: "Google",
			iconSpec: "http://iconshow.me/media/images/social/simple-icons/png/32/google.png",
			getSubmission: function(searchText) { return `https://www.google.pt/search?q=${searchText}`; }
		},
		{
			name: "YouTube",
			iconSpec: "https://www.youtube.com/yts/img/favicon_32-vfl8NGn4k.png",
			getSubmission: function(searchText) { return `https://www.youtube.com/results?search_query=${searchText}`; }
		},
		{
			name: "IMDB",
			iconSpec: "https://cdn4.iconfinder.com/data/icons/Classy_Social_Media_Icons/32/imdb.png",
			getSubmission: function(searchText) { return `http://www.imdb.com/find?s=all&q=${searchText}`; }
		},
		{
			name: "Wikipedia",
			iconSpec: "http://findicons.com/files/icons/111/popular_sites/128/wikipedia_icon.png",
			getSubmission: function(searchText) { return `https://en.wikipedia.org/wiki/Special:Search?search=${searchText}`; }
		}
	];
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

	let engines;

	if (sss.settings.contextMenuEnginesFilter === consts.ContextMenuEnginesFilter_SameAsPopupPanel) {
		engines = sss.engines;
	} else {
		engines = getVisibleEngines();
	}

	for (let i = 0; i < engines.length; i++)
	{
		let engine = engines[i];

		if (engine.hidden) {
			continue;
		}

		// TODO: add icons
		// if (engine.iconURI !== null) {
		// 	itemObject.image = engine.iconURI.spec;
		// }

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
	for (let i = 0; i < sss.selectedEngineObjs.length; i++) {
		let engineObj = sss.selectedEngineObjs[i];
		console.log(info);
		if (engineObj.name === info.menuItemId) {
			let searchText = "https://google.com/search?q=" + engineObj.name;
			// engine.getSubmission(selectionText).uri.spec;
			openUrl(searchText, sss.settings.contextMenuItemBehaviour);
			break;
		}
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
		// sss.activeWorker.port.emit("showPopup", sss.settings, sss.selectedEngineObjs);
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
/* ----------- POPUP PANEL ------------ */
/* ------------------------------------ */

function setup_Popup()
{
	browser.tabs.onActivated.removeListener(injectPageWorker);
	browser.tabs.onUpdated.removeListener(onTabUpdated);

	if (sss.settings.popupPanelOpenBehaviour !== consts.PopupOpenBehaviour_Off) {
		setupPopupPageMod();
	}
}

function setupPopupPageMod()
{
	browser.tabs.onActivated.addListener(injectPageWorker);
	browser.tabs.onUpdated.addListener(onTabUpdated);
}

function injectPageWorker()
{
	browser.tabs.executeScript({ file: "/content-scripts/selectionchange.js" }).then(function(result) {
		browser.tabs.executeScript({ file: "/content-scripts/selection-worker.js" }).then(function(result) { /* */ }, handleError);
	}, handleError);
}

function onTabUpdated(tabId, changeInfo, tab)
{
	if (changeInfo.status === "complete") {
		injectPageWorker();
	}
}

// creates engine objects that contain everything needed for each engine (and other icons) to show in the popup
function generateEngineObjects()
{
	let engineObjs = [];

	let copyEngine;
	let openLinkEngine;

	if (sss.settings.doShowCopyIconInPanel !== "0") {
		copyEngine = {
			name: "[SSS] Copy to clipboard",
			iconSpec: browser.extension.getURL("data/icons/sss-icon-copy.svg")
		};
	}

	if (sss.settings.doShowOpenLinkIconInPanel !== "0") {
		openLinkEngine = {
			name: "[SSS] Open as link",
			iconSpec: browser.extension.getURL("data/icons/sss-icon-open-link.svg")
		};
		engineObjs.push();
	}

	if (sss.settings.doShowCopyIconInPanel === consts.ShowIconInPanel_Show) {
		engineObjs.push(copyEngine);
	}

	if (sss.settings.doShowOpenLinkIconInPanel === consts.ShowIconInPanel_Show) {
		engineObjs.push(openLinkEngine);
	}

	sss.engines = getVisibleEngines().filter(function(engine) { return isEngineSelected(engine); });

	engineObjs = engineObjs.concat(
		sss.engines.map(function(engine) {
			return {
				name: engine.name,
				iconSpec: (engine.iconSpec !== null && engine.iconSpec !== undefined ? engine.iconSpec : null)
			};
		})
	);

	if (sss.settings.doShowCopyIconInPanel === consts.ShowIconInPanel_ShowAtEnd) {
		engineObjs.push(copyEngine);
	}

	if (sss.settings.doShowOpenLinkIconInPanel === consts.ShowIconInPanel_ShowAtEnd) {
		engineObjs.push(openLinkEngine);
	}

	sss.selectedEngineObjs = engineObjs;
}

function onSearchEngineClick(searchText, engineObj, clickType)
{
	if (engineObj.name == "[SSS] Copy to clipboard") {
		document.execCommand("Copy");
	} else if (engineObj.name == "[SSS] Open as link") {
		if (msg.clickType === "leftClick") {
			openUrl(searchText, sss.settings.mouseLeftButtonBehaviour);
		} else if (msg.clickType === "middleClick") {
			openUrl(searchText, sss.settings.mouseMiddleButtonBehaviour);
		} else if (msg.clickType === "ctrlClick") {
			openUrl(searchText, "2");
		}
	} else {
		if (msg.clickType === "leftClick") {
			openUrl(getSearchFromEngineObj(searchText, engineObj), sss.settings.mouseLeftButtonBehaviour);
		} else if (msg.clickType === "middleClick") {
			openUrl(getSearchFromEngineObj(searchText, engineObj), sss.settings.mouseMiddleButtonBehaviour);
		} else if (msg.clickType === "ctrlClick") {
			openUrl(getSearchFromEngineObj(searchText, engineObj), "2");	// 2 means "open in new background tab" (see openUrl)
		}
	}
}

function openUrl(urlToOpen, openingBehaviour)
{
	switch (openingBehaviour)
	{
		case "0": browser.tabs.update({ url: urlToOpen }); break;
		case "1": browser.tabs.create({ url: urlToOpen }); break;
		case "2": browser.tabs.create({ url: urlToOpen, active: false }); break;
		case "3": browser.tabs.create({ url: urlToOpen, index: browser.tabs.getCurrent().index+1 }); break;
		case "4": browser.tabs.create({ url: urlToOpen, active: false, index: browser.tabs.getCurrent().index+1 }); break;
	}
}

function getSearchFromEngineObj(searchText, engineObj)
{
	let engine = getEngineFromEngineObj(engineObj);
	if (engine !== null) {
		return engine.getSubmission(searchText);
	}
}

function getEngineFromEngineObj(engineObj)
{
	for (let key in sss.engines) {
		let engine = sss.engines[key];
		if (engine.name === engineObj.name) {
			return engine;
		}
	}
	return null;
}

/* ------------------------------------ */
/* ------------------------------------ */
/* ------------------------------------ */
