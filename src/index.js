/* ==================================== */
/* ====== Swift Selection Search ====== */
/* ==================================== */

"use strict";

var sss = {};
var sdk = {};

var PopupOpenBehaviour_Off = 0;
var PopupOpenBehaviour_Auto = 1;
var PopupOpenBehaviour_Mouse = 2;
var PopupOpenBehaviour_Keyboard = 3;

var ContextMenuEnginesFilter_All = 0;
var ContextMenuEnginesFilter_SameAsPopupPanel = 1;

var AutoCopyToClipboard_Off = 0;
var AutoCopyToClipboard_Always = 1;

setup_Requires();
setup_Preferences();
setup_ContextMenu();
setup_Popup();

/* ------------------------------------ */
/* ------------- IMPORTS -------------- */
/* ------------------------------------ */

function setup_Requires()
{
	// Cc and Ci are used to get the installed search engines.
	const {Cc,Ci} = require("chrome");
	sdk.searchService = Cc["@mozilla.org/browser/search-service;1"].getService(Ci.nsIBrowserSearchService);

	sdk.selfSdk = require("sdk/self");
	sdk.data = sdk.selfSdk.data;
	sdk.tabs = require("sdk/tabs");
	sdk.pageMod = require("sdk/page-mod");
	sdk.panel = require("sdk/panel");
	sdk.simplePrefs = require('sdk/simple-prefs');
	sdk.simpleStorage = require("sdk/simple-storage");
	sdk.contextMenu = require("sdk/context-menu");
	sdk.hotkey = require("sdk/hotkeys");
	sdk.clipboard = require("sdk/clipboard");						// to copy text to clipboard
	sdk.preferencesService = require('sdk/preferences/service');	// to reset prefs to default values
	sdk.viewFor = require("sdk/view/core").viewFor;
}

//Tree Style Tab compatibility
function openTab(options) {
	let nsWindow = sdk.viewFor(sdk.tabs.activeTab.window);
	if ('TreeStyleTabService' in nsWindow) {
		let nsTab = sdk.viewFor(sdk.tabs.activeTab);
		nsWindow.TreeStyleTabService.readyToOpenChildTab(nsTab);
	}

	sdk.tabs.open(options);
}

/* ------------------------------------ */
/* ------------- SETTINGS ------------- */
/* ------------------------------------ */

function setup_Preferences()
{
	if (sdk.simpleStorage.storage.searchEngines) {
		purgeNonExistentEngines();
	} else {
		sdk.simpleStorage.storage.searchEngines = {};
	}

	generateEngineObjects();

	setCallbacksForPreferences();
}

function setCallbacksForPreferences()
{
	// any change should destroy any active popup and force the options to be recreated next time they're needed
	sdk.simplePrefs.on("", function() {
		generateEngineObjects();
		resetAllWorkers();
	});

	sdk.simplePrefs.on("popupPanelOpenBehavior", function() {
		if (sdk.simplePrefs.prefs.popupPanelOpenBehavior === PopupOpenBehaviour_Off) {	// it's off
			if (sss.popupPageMod) {
				destroyPageMod();
			}
		} else if (!sss.popupPageMod) {	// it's on but no pageMod, so create it
			setupPopupPageMod();
		}
	});

	sdk.simplePrefs.on("popupPanelHotkey", function() {
		setupShowPopupHotkey();
	});

	sdk.simplePrefs.on("popupPanelDisableHotkey", function() {
		setupDisablePopupHotkey();
	});

	sdk.simplePrefs.on("selectEnginesButton", function() {
		createEngineSelectionPanel();
	});

	sdk.simplePrefs.on("openEngineManager", function() {
		openTab({url: "about:preferences#search"});
	});

	sdk.simplePrefs.on("enableEnginesInContextMenu", function() {
		setup_ContextMenu();
	});

	sdk.simplePrefs.on("contextMenuEnginesFilter", function() {
		setup_ContextMenu();
	});

	// keep hexadecimal value and color picker in sync
	sdk.simplePrefs.on("popupPanelBackgroundColor", function() {
		sdk.simplePrefs.prefs.popupPanelBackgroundColorPicker = sdk.simplePrefs.prefs.popupPanelBackgroundColor;
	});
	sdk.simplePrefs.on("popupPanelBackgroundColorPicker", function() {
		sdk.simplePrefs.prefs.popupPanelBackgroundColor = sdk.simplePrefs.prefs.popupPanelBackgroundColorPicker;
	});

	// keep hexadecimal value and color picker in sync
	sdk.simplePrefs.on("popupPanelHighlightColor", function() {
		sdk.simplePrefs.prefs.popupPanelHighlightColorPicker = sdk.simplePrefs.prefs.popupPanelHighlightColor;
	});
	sdk.simplePrefs.on("popupPanelHighlightColorPicker", function() {
		sdk.simplePrefs.prefs.popupPanelHighlightColor = sdk.simplePrefs.prefs.popupPanelHighlightColorPicker;
	});

	sdk.simplePrefs.on("resetAllSettings", function() {
		for (var prefName in sdk.simplePrefs.prefs) {
			sdk.preferencesService.reset("extensions.jid1-KdTtiCj6wxVAFA@jetpack." + prefName);
			sdk.simpleStorage.storage.searchEngines = {};
		}
	});
}

function setupShowPopupHotkey()
{
	if (sss.showPopupHotkey) {
		sss.showPopupHotkey.destroy();
		sss.showPopupHotkey = undefined;
	}

	if (sdk.simplePrefs.prefs.popupPanelOpenBehavior !== PopupOpenBehaviour_Off) {
		sss.showPopupHotkey = setPopupHotkey(sdk.simplePrefs.prefs.popupPanelHotkey, function() {
			if (sss.activeWorker) {
				sss.activeWorker.port.emit("showPopup", sdk.simplePrefs.prefs, sss.engineObjs);
			}
		});
	}
}

function setupDisablePopupHotkey()
{
	if (sss.disablePopupHotkey) {
		sss.disablePopupHotkey.destroy();
		sss.disablePopupHotkey = undefined;
	}

	if (sdk.simplePrefs.prefs.popupPanelOpenBehavior !== PopupOpenBehaviour_Off) {
		sss.disablePopupHotkey = setPopupHotkey(sdk.simplePrefs.prefs.popupPanelDisableHotkey, function() {
			if (sdk.simplePrefs.prefs.popupPanelOpenBehavior === PopupOpenBehaviour_Auto) {
				sdk.simplePrefs.prefs.popupPanelOpenBehavior = PopupOpenBehaviour_Keyboard;
			} else if (sdk.simplePrefs.prefs.popupPanelOpenBehavior === PopupOpenBehaviour_Keyboard) {
				sdk.simplePrefs.prefs.popupPanelOpenBehavior = PopupOpenBehaviour_Auto;
			}
		});
	}
}

function setPopupHotkey(hotkeyCombo, onPressFunc)
{
	if (!hotkeyCombo) {
		return;
	}

	try {
		return sdk.hotkey.Hotkey({
			combo: hotkeyCombo,
			onPress: onPressFunc
		});
	} catch (e) {
		// invalid hotkey
	}
	return undefined;
}

function createEngineSelectionPanel()
{
	var visibleEngines = sdk.searchService.getVisibleEngines({});

	var engineObjects = visibleEngines.map(function(engine) {
		return {
			name: engine.name,
			iconSpec: (engine.iconURI !== null ? engine.iconURI.spec : null),
			active: isEngineActive(engine)
		}
	});

	var calculatedHeight = engineObjects.length * 20 + 100;
	if (calculatedHeight > 450) {
		calculatedHeight = 450;
	}

	var panel = sdk.panel.Panel({
		contentURL: sdk.data.url("engine-settings.html"),
		contentScriptFile: sdk.data.url("engine-settings.js"),
		height: calculatedHeight
	});

	panel.port.emit('setupSettingsPanel', engineObjects);
	panel.port.on("onSearchEngineToggle", onSearchEngineToggle);

	panel.show();
}

function onSearchEngineToggle(engine)
{
	sdk.simpleStorage.storage.searchEngines[engine.name] = engine.active;
	generateEngineObjects();
	resetAllWorkers();
	setup_ContextMenu();
}

function isEngineActive(engine)
{
	if (!sdk.simpleStorage.storage.searchEngines.hasOwnProperty(engine.name)) {
		sdk.simpleStorage.storage.searchEngines[engine.name] = true;
	}
	return sdk.simpleStorage.storage.searchEngines[engine.name];
}

function purgeNonExistentEngines()
{
	var visibleEngineNames = sdk.searchService.getVisibleEngines({})
		.map(function(engine) { return engine.name; });

	for (var engineName in sdk.simpleStorage.storage.searchEngines) {
		if (visibleEngineNames.indexOf(engineName) === -1) {
			delete sdk.simpleStorage.storage.searchEngines[engineName];
		}
	}
}

/* ------------------------------------ */
/* ----------- CONTEXT MENU ----------- */
/* ------------------------------------ */

function setup_ContextMenu()
{
	if (sss.contextMenu) {
		sss.contextMenu.destroy();
		sss.contextMenu = undefined;
	}
	if (sdk.simplePrefs.prefs.enableEnginesInContextMenu) {
		createContextMenu();
	}
}

function createContextMenu()
{
	var visibleEngines = sdk.searchService.getVisibleEngines({});
	var engines;

	if (sdk.simplePrefs.prefs.contextMenuEnginesFilter === ContextMenuEnginesFilter_SameAsPopupPanel) {
		engines = sss.engines;
	} else {
		engines = visibleEngines;
	}

	var items = [];

	for (var i = 0; i < engines.length; i++)
	{
		let engine = engines[i];

		if (!engine.hidden)
		{
			var itemObject = {
				label: engine.name,
				contentScriptFile: sdk.data.url("context-menu.js"),
				onMessage: function (selectionText) {
					var searchText = engine.getSubmission(selectionText).uri.spec;
					openUrl(searchText, sdk.simplePrefs.prefs.contextMenuItemBehavior);
				}
			};

			if (engine.iconURI !== null) {
				itemObject.image = engine.iconURI.spec;
			}

			items.push(sdk.contextMenu.Item(itemObject));
		}
	}

	sss.contextMenu = sdk.contextMenu.Menu({
		label: "Search With...",
		context: sdk.contextMenu.SelectionContext(),
		items: items
		// image: sdk.data.url("context-icon-16.png")
	});
}

/* ------------------------------------ */
/* ----------- POPUP PANEL ------------ */
/* ------------------------------------ */

function setup_Popup()
{
	// this method only runs once

	sss.workers = [];
	sss.workerID = 0;
	sss.activeWorker = undefined;

	setupShowPopupHotkey();
	setupDisablePopupHotkey();

	if (sdk.simplePrefs.prefs.popupPanelOpenBehavior !== PopupOpenBehaviour_Off) {
		setupPopupPageMod();
	}
}

function setupPopupPageMod()
{
	sss.popupPageMod = sdk.pageMod.PageMod({
		include: "*",
		contentScriptFile: [sdk.data.url("selectionchange.js"), sdk.data.url("selection-worker.js")],
		attachTo: ["existing", "top"],
		contentScriptWhen: "ready",
		onAttach: function(worker)
		{
			worker.activate = function() { activateWorker(worker); }
			worker.deactivate = function() { deactivateWorker(worker); }
			worker.onDetach = function() { onDetachWorker(worker); }

			sss.workers.push(worker);
			worker.id = sss.workerID++;
			// console.log("onAttach " + worker.id);

			worker.on('detach', worker.onDetach);
			worker.on('pageshow', worker.activate);
			if (worker.tab) {	// fix for settings change
				worker.tab.on('activate', worker.activate);
			}

			worker.activate();
		}
	});
}

function activateWorker(worker)
{
	if (worker === sss.activeWorker || !worker.tab || worker.tab.id !== sdk.tabs.activeTab.id) {
		return;
	}

	// console.log("activateWorker " + worker.id + " with tab " + worker.tab.url);

	if (sss.activeWorker) {
		sss.activeWorker.deactivate();
	}
	sss.activeWorker = worker;

	worker.port.on("onSearchEngineLeftClick", onSearchEngineLeftClick);
	worker.port.on("onSearchEngineMiddleClick", onSearchEngineMiddleClick);
	worker.port.on("onSearchEngineCtrlClick", onSearchEngineCtrlClick);

	if (sdk.simplePrefs.prefs.autoCopyToClipboard === AutoCopyToClipboard_Always) {
		worker.port.on("onTextSelection", copyTextToClipboard);
	}

	worker.port.emit("activate", sdk.simplePrefs.prefs, sss.engineObjs);

	worker.isDetached = false;
}

function deactivateWorker(worker)
{
	if (worker.isDetached) {
		return;
	}

	// console.log("deactivateWorker " + worker.id);

	worker.port.emit("deactivate");

	worker.port.removeListener("onSearchEngineLeftClick", onSearchEngineLeftClick);
	worker.port.removeListener("onSearchEngineMiddleClick", onSearchEngineMiddleClick);
	worker.port.removeListener("onSearchEngineCtrlClick", onSearchEngineCtrlClick);

	worker.port.removeListener("onTextSelection", copyTextToClipboard);

	if (worker === sss.activeWorker) {
		sss.activeWorker = undefined;
	}
}

function onDetachWorker(worker)
{
	// console.log("detach " + worker.id);

	worker.removeListener('detach', worker.onDetach);
	worker.removeListener('pageshow', worker.activate);
	if (worker.tab) {	// fix for settings change
		worker.tab.removeListener('activate', worker.activate);
	}

	var index = sss.workers.indexOf(worker);
	if (index !== -1) {
		sss.workers.splice(index, 1);
	}

	worker.isDetached = true;
}

function destroyPageMod()
{
	if (sss.activeWorker) {
		sss.activeWorker.port.emit("deactivate");
		sss.activeWorker = undefined;
	}

	if (sss.workers) {
		for (var i = 0; i < sss.workers.length; i++) {
			var worker = sss.workers[i];
			worker.port.emit("deactivate");
			worker.destroy();	// calls detach on worker
		}
		sss.workers = [];
	}

	if (sss.popupPageMod) {
		sss.popupPageMod.destroy();
		sss.popupPageMod = undefined;
	}
}

function resetAllWorkers()
{
	// deactivate all workers
	for (var i = 0; i < sss.workers.length; i++) {
		sss.workers[i].port.emit("deactivate");
	}

	// re-activate the active worker, if any
	if (sss.activeWorker) {
		sss.activeWorker.port.emit("activate", sdk.simplePrefs.prefs, sss.engineObjs);
	}
}

function generateEngineObjects()
{
	var engineObjs = [];

	var copyEngine;
	var openLinkEngine;

	if (sdk.simplePrefs.prefs.doShowCopyIconInPanel !== 0) {
		copyEngine = {
			name: "[SSS] Copy to clipboard",
			iconSpec: sdk.data.url("icons/sss-icon-copy.svg")
		};
	}

	if (sdk.simplePrefs.prefs.doShowOpenLinkIconInPanel !== 0) {
		openLinkEngine = {
			name: "[SSS] Open as link",
			iconSpec: sdk.data.url("icons/sss-icon-open-link.svg")
		};
		engineObjs.push();
	}

	if (sdk.simplePrefs.prefs.doShowCopyIconInPanel === 1) {
		engineObjs.push(copyEngine);
	}

	if (sdk.simplePrefs.prefs.doShowOpenLinkIconInPanel === 1) {
		engineObjs.push(openLinkEngine);
	}

	var visibleEngines = sdk.searchService.getVisibleEngines({});

	sss.engines = visibleEngines.filter(function(engine) {
		return isEngineActive(engine);
	});

	engineObjs = engineObjs.concat(
		sss.engines.map(function(engine) {
			return {
				name: engine.name,
				iconSpec: (engine.iconURI !== null ? engine.iconURI.spec : null)
			};
		})
	);

	if (sdk.simplePrefs.prefs.doShowCopyIconInPanel === 2) {
		engineObjs.push(copyEngine);
	}

	if (sdk.simplePrefs.prefs.doShowOpenLinkIconInPanel === 2) {
		engineObjs.push(openLinkEngine);
	}

	sss.engineObjs = engineObjs;
}

function onSearchEngineLeftClick(searchText, engineObj)
{
	if (engineObj.name == "[SSS] Copy to clipboard") {
		sdk.clipboard.set(searchText);
	} else if (engineObj.name == "[SSS] Open as link") {
		openUrl(searchText, sdk.simplePrefs.prefs.mouseLeftButtonBehavior);
	} else {
		openUrl(getSearchFromEngineObj(searchText, engineObj), sdk.simplePrefs.prefs.mouseLeftButtonBehavior);
	}
}

function onSearchEngineMiddleClick(searchText, engineObj)
{
	if (engineObj.name == "[SSS] Copy to clipboard") {
		sdk.clipboard.set(searchText);
	} else if (engineObj.name == "[SSS] Open as link") {
		openUrl(searchText, sdk.simplePrefs.prefs.mouseMiddleButtonBehavior);
	} else {
		openUrl(getSearchFromEngineObj(searchText, engineObj), sdk.simplePrefs.prefs.mouseMiddleButtonBehavior);
	}
}

function onSearchEngineCtrlClick(searchText, engineObj)
{
	if (engineObj.name == "[SSS] Copy to clipboard") {
		sdk.clipboard.set(searchText);
	} else if (engineObj.name == "[SSS] Open as link") {
		openUrl(searchText, 2);
	} else {
		openUrl(getSearchFromEngineObj(searchText, engineObj), 2);	// 2 means "open in new background tab" (see openUrl)
	}
}

function openUrl(urlToOpen, openingBehavior)
{
	switch (openingBehavior)
	{
		case 0: sdk.tabs.activeTab.url = urlToOpen; break;
		case 1: openTab({ url: urlToOpen }); break;
		case 2: openTab({ url: urlToOpen, inBackground: true }); break;
		case 3:
			var index = sdk.tabs.activeTab.index;
			openTab({ url: urlToOpen });
			sdk.tabs[sdk.tabs.length-1].index = index + 1;
			break;
		case 4:
			var index = sdk.tabs.activeTab.index;
			openTab({ url: urlToOpen, inBackground: true });
			sdk.tabs[sdk.tabs.length-1].index = index + 1;
			break;
	}
}

function getSearchFromEngineObj(searchText, engineObj)
{
	var engine = getEngineFromEngineObj(engineObj);
	if (engine !== null) {
		return engine.getSubmission(searchText).uri.spec;
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

function copyTextToClipboard(text)
{
	sdk.clipboard.set(text);
}

/* ------------------------------------ */
/* ------------------------------------ */
/* ------------------------------------ */
