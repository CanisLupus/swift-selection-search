/* ==================================== */
/* ====== Swift Selection Search ====== */
/* ==================================== */

"use strict";

var sss = {};

var PopupOpenBehaviour_Off = "0";
var PopupOpenBehaviour_Auto = "1";
var PopupOpenBehaviour_Mouse = "2";
var PopupOpenBehaviour_Keyboard = "3";

var ContextMenuEnginesFilter_All = "0";
var ContextMenuEnginesFilter_SameAsPopupPanel = "1";

var AutoCopyToClipboard_Off = "0";
var AutoCopyToClipboard_Always = "1";

const gettingStoredSettings = browser.storage.local.get();
gettingStoredSettings.then(setupSSS, handleError);

// Main SSS setup. Called when settings are acquired. Prepares everything.
function setupSSS(settings)
{
	//Components.utils.import("resource://gre/modules/Services.jsm");
	// console.log(Services.search.getEngines());

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

	// prepare engines for popup
	generateEngineObjects();

	// setCallbacksForPreferences();

	setup_ContextMenu();
	setup_Popup();

	browser.runtime.onMessage.addListener(onContentScriptMessage);

	console.log("Swift Selection Search has started!");
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
		if (msg.clickType === "leftClick") {
			onSearchEngineLeftClick(msg.selection, msg.engine);
		} else if (msg.clickType === "middleClick") {
			onSearchEngineMiddleClick(msg.selection, msg.engine);
		} else if (msg.clickType === "ctrlClick") {
			onSearchEngineCtrlClick(msg.selection, msg.engine);
		}
	} else if (msg.type === "log") {
		if (typeof msg.log === 'object') {
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

function setCallbacksForPreferences()
{
	function onSettingsChanged(changes, area) {
		if (area !== "local") {
			return;
		}

		// any change should destroy any active popup and force the options to be recreated next time they're needed
		generateEngineObjects();
		resetAllWorkers();

		var changedItems = Object.keys(changes);

		for (var item of changedItems)
		{
			if (item === "popupPanelOpenBehaviour") {
				if (sss.settings.popupPanelOpenBehaviour === PopupOpenBehaviour_Off) {	// it's off
					if (sss.popupPageMod) {
						destroyPageMod();
					}
				} else if (!sss.popupPageMod) {	// it's on but no pageMod, so create it
					setupPopupPageMod();
				}
			}
			else if (item === "popupPanelHotkey"
				  || item === "popupPanelDisableHotkey") {
				setupPopupHotkeys();
			}
			// else if (item === "openEngineManager") {
			// 	browser.tabs.create({url: "about:preferences#search"});
			// }
			else if (item === "searchEngines"
				  || item === "enableEnginesInContextMenu"
				  || item === "contextMenuEnginesFilter") {
				setup_ContextMenu();
			}
			// console.log(changes[item].oldValue);
			// console.log(changes[item].newValue);
		}
	}

	browser.storage.onChanged.addListener(onSettingsChanged);
}

function setupPopupHotkeys()
{
	// clear any old registrations
	if (browser.commands.onCommand.hasListener(onHotkey)) {
		browser.commands.onCommand.removeListener(onHotkey);
	}

	if (sss.settings.popupPanelOpenBehaviour !== PopupOpenBehaviour_Off) {
		browser.commands.onCommand.addListener(onHotkey);
	}
}

function onHotkey(command)
{
	if (command == "open-popup") {
		// sss.activeWorker.port.emit("showPopup", sss.settings, sss.selectedEngineObjs);
	} else if(command == "toggle-auto-popup") {
		// toggles value between Auto and Keyboard
		if (sss.settings.popupPanelOpenBehaviour === PopupOpenBehaviour_Auto) {
			sss.settings.popupPanelOpenBehaviour = PopupOpenBehaviour_Keyboard;
		} else if (sss.settings.popupPanelOpenBehaviour === PopupOpenBehaviour_Keyboard) {
			sss.settings.popupPanelOpenBehaviour = PopupOpenBehaviour_Auto;
		}
	}
}

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
	var visibleEngineNames = getVisibleEngines().map(function(engine) { return engine.name; });

	for (var engineName in sss.settings.selectedSearchEngines) {
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
	browser.contextMenus.removeAll();

	if (sss.settings.enableEnginesInContextMenu === true) {
		createContextMenu();
	}
}

function createContextMenu()
{
	var engines;

	if (sss.settings.contextMenuEnginesFilter === ContextMenuEnginesFilter_SameAsPopupPanel) {
		engines = sss.engines;
	} else {
		engines = getVisibleEngines();
	}

	for (var i = 0; i < engines.length; i++)
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

	browser.contextMenus.onClicked.addListener((info, tab) => {
		for (var i = 0; i < sss.selectedEngineObjs.length; i++) {
			var engineObj = sss.selectedEngineObjs[i];
			if (engineObj.name === info.menuItemId) {
				var searchText = "https://google.com/search?q=" + engineObj.name;
				// engine.getSubmission(selectionText).uri.spec;
				openUrl(searchText, sss.settings.contextMenuItemBehaviour);
				break;
			}
		}
	});
}

/* ------------------------------------ */
/* ----------- POPUP PANEL ------------ */
/* ------------------------------------ */

function setup_Popup()
{
	setupPopupHotkeys();

	if (sss.settings.popupPanelOpenBehaviour !== PopupOpenBehaviour_Off) {
		setupPopupPageMod();
	}
}

function setupPopupPageMod()
{
	const injectPageWorker = function() {
		browser.tabs.executeScript({ file: "/content-scripts/selectionchange.js" }).then(function(result) {
			browser.tabs.executeScript({ file: "/content-scripts/selection-worker.js" }).then(function(result) { /* */ }, handleError);
		}, handleError);
	};

	browser.tabs.onActivated.addListener(injectPageWorker);
	browser.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
		if (changeInfo.status === "complete") {
			injectPageWorker();
		}
	});
}

// creates engine objects that contain everything needed for each engine (and other icons) to show in the popup
function generateEngineObjects()
{
	var engineObjs = [];

	var copyEngine;
	var openLinkEngine;

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

	if (sss.settings.doShowCopyIconInPanel === "1") {
		engineObjs.push(copyEngine);
	}

	if (sss.settings.doShowOpenLinkIconInPanel === "1") {
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

	if (sss.settings.doShowCopyIconInPanel === "2") {
		engineObjs.push(copyEngine);
	}

	if (sss.settings.doShowOpenLinkIconInPanel === "2") {
		engineObjs.push(openLinkEngine);
	}

	sss.selectedEngineObjs = engineObjs;
}

function onSearchEngineLeftClick(searchText, engineObj)
{
	if (engineObj.name == "[SSS] Copy to clipboard") {
		document.execCommand("Copy");
	} else if (engineObj.name == "[SSS] Open as link") {
		openUrl(searchText, sss.settings.mouseLeftButtonBehaviour);
	} else {
		openUrl(getSearchFromEngineObj(searchText, engineObj), sss.settings.mouseLeftButtonBehaviour);
	}
}

function onSearchEngineMiddleClick(searchText, engineObj)
{
	if (engineObj.name == "[SSS] Copy to clipboard") {
		document.execCommand("Copy");
	} else if (engineObj.name == "[SSS] Open as link") {
		openUrl(searchText, sss.settings.mouseMiddleButtonBehaviour);
	} else {
		openUrl(getSearchFromEngineObj(searchText, engineObj), sss.settings.mouseMiddleButtonBehaviour);
	}
}

function onSearchEngineCtrlClick(searchText, engineObj)
{
	if (engineObj.name == "[SSS] Copy to clipboard") {
		document.execCommand("Copy");
	} else if (engineObj.name == "[SSS] Open as link") {
		openUrl(searchText, "2");
	} else {
		openUrl(getSearchFromEngineObj(searchText, engineObj), "2");	// 2 means "open in new background tab" (see openUrl)
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
	var engine = getEngineFromEngineObj(engineObj);
	if (engine !== null) {
		return engine.getSubmission(searchText);
	}
}

function getEngineFromEngineObj(engineObj)
{
	for (var key in sss.engines) {
		var engine = sss.engines[key];
		if (engine.name === engineObj.name) {
			return engine;
		}
	}
	return null;
}

/* ------------------------------------ */
/* ------------------------------------ */
/* ------------------------------------ */
