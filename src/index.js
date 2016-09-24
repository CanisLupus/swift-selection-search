(function() {

/* ==================================== */
/* ====== Swift Selection Search ====== */
/* ==================================== */

sss = {};
sdk = {};
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
	sdk.searchService = Cc["@mozilla.org/browser/search-service;1"]
		.getService(Ci.nsIBrowserSearchService);

	sdk.selfSdk = require("sdk/self");
	sdk.data = sdk.selfSdk.data;
	sdk.tabs = require("sdk/tabs");
	sdk.pageMod = require("sdk/page-mod");
	sdk.selection = require("sdk/selection");
	sdk.panel = require("sdk/panel");
	sdk.simplePrefs = require('sdk/simple-prefs');
	sdk.simpleStorage = require("sdk/simple-storage");
	sdk.contextMenu = require("sdk/context-menu");
	sdk.hotkey = require("sdk/hotkeys");
	sdk.clipboard = require("sdk/clipboard");
}

/* ------------------------------------ */
/* ------------- SETTINGS ------------- */
/* ------------------------------------ */

function setup_Preferences()
{
	PopupOpenBehaviour_Off = 0;
	PopupOpenBehaviour_Auto = 1;
	// PopupOpenBehaviour_Mouse = 2;
	PopupOpenBehaviour_Keyboard = 3;

	if (sdk.simpleStorage.storage.searchEngines) {
		purgeNonExistentEngines();
	} else {
		sdk.simpleStorage.storage.searchEngines = {};
	}

	setCallbacksForPreferences();
}

function setCallbacksForPreferences()
{
	// any change should destroy any active popup and force the options to be recreated next time they're needed
	sdk.simplePrefs.on("", function() {
		for (var i = 0; i < sss.workers.length; i++) {
			sss.workers[i].port.emit("destroyPopup");
		}
		if (sss.activeWorker) {
			sss.activeWorker.port.emit("setup", sdk.simplePrefs.prefs["popupLocation"]);
		}
		sss.options = undefined;
	});

	sdk.simplePrefs.on("popupPanelOpenBehavior", function() {
		// console.log("popupPanelOpenBehavior changed to " + sdk.simplePrefs.prefs['popupPanelOpenBehavior']);
		if (sdk.simplePrefs.prefs['popupPanelOpenBehavior'] === PopupOpenBehaviour_Off) {	// it's off
			if (sss.popupPageMod) {
				destroyPageMod();
			}
		} else if (!sss.popupPageMod) {	// it's on but no pageMod, so create it
			setupPopupPageMod();
		} else if (sss.activeWorker) {	// enable/disable selection event on current worker
			if (sdk.simplePrefs.prefs['popupPanelOpenBehavior'] === PopupOpenBehaviour_Auto) {
				sdk.selection.on('select', sss.activeWorker.onSelection);
			} else {	// keyboard selection only
				sdk.selection.removeListener('select', sss.activeWorker.onSelection);
			}
		}
	});

	sdk.simplePrefs.on("popupPanelHotkey", function() {
		setupShowPopupHotkey();
	});

	sdk.simplePrefs.on("popupPanelDisableHotkey", function() {
		setupDisablePopupHotkey();
	});

	sdk.simplePrefs.on("selectEnginesButton", function() {
		createSettingsPanel();
	});

	sdk.simplePrefs.on("openEngineManager", function() {
		sdk.tabs.open({url: "about:preferences#search"});
	});

	sdk.simplePrefs.on("enableEnginesInContextMenu", function() {
		setup_ContextMenu();
	});
}

function setupShowPopupHotkey()
{
	// console.log("setupShowPopupHotkey");

	if (sss.showPopupHotkey) {
		sss.showPopupHotkey.destroy();
		sss.showPopupHotkey = undefined;
	}

	if (sdk.simplePrefs.prefs['popupPanelOpenBehavior'] !== PopupOpenBehaviour_Off) {
		var hotkeyCombo = sdk.simplePrefs.prefs['popupPanelHotkey'];
		sss.showPopupHotkey = setPopupHotkey(hotkeyCombo, function() {
			if (sss.activeWorker) {
				sss.activeWorker.onSelection();
			}
		});
	}
}

function setupDisablePopupHotkey()
{
	// console.log("setupDisablePopupHotkey");

	if (sss.disablePopupHotkey) {
		sss.disablePopupHotkey.destroy();
		sss.disablePopupHotkey = undefined;
	}

	if (sdk.simplePrefs.prefs['popupPanelOpenBehavior'] !== PopupOpenBehaviour_Off) {
		var hotkeyCombo = sdk.simplePrefs.prefs['popupPanelDisableHotkey'];
		sss.disablePopupHotkey = setPopupHotkey(hotkeyCombo, function() {
			// console.log("on press disable hotkey");
			if (sdk.simplePrefs.prefs['popupPanelOpenBehavior'] === PopupOpenBehaviour_Auto) {
				sdk.simplePrefs.prefs['popupPanelOpenBehavior'] = PopupOpenBehaviour_Keyboard;
			} else if (sdk.simplePrefs.prefs['popupPanelOpenBehavior'] === PopupOpenBehaviour_Keyboard) {
				sdk.simplePrefs.prefs['popupPanelOpenBehavior'] = PopupOpenBehaviour_Auto;
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

function createOptionsObjectFromPrefs()
{
	var opt = {};

	opt.popupPaddingX = sdk.simplePrefs.prefs['popupPaddingX'];
	opt.popupPaddingY = sdk.simplePrefs.prefs['popupPaddingY'];

	opt.popupAnimationDuration = sdk.simplePrefs.prefs['popupPanelAnimationDuration'];
	opt.itemPadding = sdk.simplePrefs.prefs['itemPadding'];

	opt.popupOffsetX = sdk.simplePrefs.prefs["popupOffsetX"];
	if (sdk.simplePrefs.prefs["negatePopupOffsetX"]) {
		opt.popupOffsetX = -opt.popupOffsetX;
	}
	opt.popupOffsetY = sdk.simplePrefs.prefs["popupOffsetY"];
	if (sdk.simplePrefs.prefs["negatePopupOffsetY"]) {
		opt.popupOffsetY = -opt.popupOffsetY;
	}

	opt.itemSize = sdk.simplePrefs.prefs['itemSize'];
	opt.useSingleRow = sdk.simplePrefs.prefs['useSingleRow'];
	opt.nItemsPerRow = sdk.simplePrefs.prefs['nItemsPerRow'];

	opt.hoverBehavior = sdk.simplePrefs.prefs["itemHoverBehavior"];
	opt.popupLocation = sdk.simplePrefs.prefs["popupLocation"];
	opt.hidePopupOnPageScroll = sdk.simplePrefs.prefs["hidePopupPanelOnPageScroll"];
	opt.hidePopupOnSearch = sdk.simplePrefs.prefs["hidePopupPanelOnSearch"];

	return opt;
}

function createSettingsPanel()
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
	if (sdk.simplePrefs.prefs['enableEnginesInContextMenu'] === true) {
		createContextMenu();
	}
}

function createContextMenu()
{
	var visibleEngines = sdk.searchService.getVisibleEngines({});
	var items = [];

	for (var i = 0; i < visibleEngines.length; i++)
	{
		let engine = visibleEngines[i];

		if (!engine.hidden)
		{
			var itemObject = {
				label: engine.name,
				contentScriptFile: sdk.data.url("context-menu.js"),
				onMessage: function (selectionText) {
					var searchText = engine.getSubmission(selectionText).uri.spec;
					doSearch(searchText, sdk.simplePrefs.prefs['contextMenuItemBehavior']);
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

	// console.log("setup_Popup");

	sss.workers = [];
	sss.workerID = 0;
	sss.activeWorker = undefined;

	setupShowPopupHotkey();
	setupDisablePopupHotkey();

	if (sdk.simplePrefs.prefs['popupPanelOpenBehavior'] !== PopupOpenBehaviour_Off) {
		setupPopupPageMod();
	}
}

function setupPopupPageMod()
{
	// console.log("setupPopupPageMod");

	sss.popupPageMod = sdk.pageMod.PageMod({
		include: "*",
		contentScriptFile: sdk.data.url("selection-worker.js"),
		attachTo: ["existing", "top"],
		contentScriptWhen: "ready",
		onAttach: function(worker)
		{
			worker.activate = function() { activateWorker(worker); }
			worker.deactivate = function() { deactivateWorker(worker); }
			worker.onDetach = function() { onDetachWorker(worker); }
			worker.onSelection = function() { onWorkerTextSelection(worker); }

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
	if (worker === sss.activeWorker) {
		return;
	}
	if (!worker.tab || worker.tab.id !== sdk.tabs.activeTab.id) {
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
	if (sdk.simplePrefs.prefs['popupPanelOpenBehavior'] === PopupOpenBehaviour_Auto) {
		sdk.selection.on('select', worker.onSelection);
	}
	worker.port.emit("setup", sdk.simplePrefs.prefs["popupLocation"]);

	worker.wasDetached = false;
}

function deactivateWorker(worker)
{
	if (worker.wasDetached) {
		return;
	}

	// console.log("deactivateWorker " + worker.id);

	worker.port.emit("destroyPopup");
	worker.port.removeListener("onSearchEngineLeftClick", onSearchEngineLeftClick);
	worker.port.removeListener("onSearchEngineMiddleClick", onSearchEngineMiddleClick);
	worker.port.removeListener("onSearchEngineCtrlClick", onSearchEngineCtrlClick);
	sdk.selection.removeListener('select', worker.onSelection);

	// assumes deactivate is only called on the current activeWorker
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
	sdk.selection.removeListener('select', worker.onSelection);

	var index = sss.workers.indexOf(worker);
	if (index !== -1) {
		sss.workers.splice(index, 1);
	}

	worker.wasDetached = true;
}

function onWorkerTextSelection(worker)
{
	if (sdk.selection.text)
	{
		// console.log("onWorkerTextSelection " + worker.id);

		var visibleEngines = sdk.searchService.getVisibleEngines({});
		var engines = visibleEngines.filter(function(engine) { return isEngineActive(engine); });
		var engineObjs = engines.map(function(engine) { return convertEngineToObject(engine); });

		sss.engines = engines;

		if (!sss.options) {
			sss.options = createOptionsObjectFromPrefs();
		}
		worker.port.emit("onSelection", sss.options, engineObjs);

		if (sdk.simplePrefs.prefs['autoCopyToClipboard']) {
			sdk.clipboard.set(sdk.selection.text);
		}
	}
}

function destroyPageMod()
{
	// console.log("destroyPageMod");

	if (sss.activeWorker) {
		sss.activeWorker.port.emit("destroyPopup");
		sss.activeWorker = undefined;
	}

	if (sss.workers) {
		for (var i = 0; i < sss.workers.length; i++) {
			var worker = sss.workers[i];
			worker.port.emit("destroyPopup");
			// worker.deactivate();
			worker.destroy();	// calls detach on worker
		}
		sss.workers = [];
	}

	if (sss.popupPageMod) {
		sss.popupPageMod.destroy();
		sss.popupPageMod = undefined;
	}
}

function convertEngineToObject(engine)
{
	return {
		name: engine.name,
		iconSpec: (engine.iconURI !== null ? engine.iconURI.spec : null)
	};
}

function onSearchEngineLeftClick(searchText, engineObj)
{
	// console.log("onSearchEngineLeftClick");
	doSearch(getSearchFromEngineObj(searchText, engineObj), sdk.simplePrefs.prefs['mouseLeftButtonBehavior']);
}

function onSearchEngineMiddleClick(searchText, engineObj)
{
	// console.log("onSearchEngineMiddleClick");
	doSearch(getSearchFromEngineObj(searchText, engineObj), sdk.simplePrefs.prefs['mouseMiddleButtonBehavior']);
}

function onSearchEngineCtrlClick(searchText, engineObj)
{
	// console.log("onSearchEngineCtrlClick");
	doSearch(getSearchFromEngineObj(searchText, engineObj), 2);	// 2 means "open in new background tab" (see doSearch)
}

function doSearch(searchUrl, behavior)
{
	// console.log("doSearch");
	switch (behavior)
	{
		case 0: sdk.tabs.activeTab.url = searchUrl; break;
		case 1: sdk.tabs.open({ url: searchUrl }); break;
		case 2: sdk.tabs.open({ url: searchUrl, inBackground: true }); break;
	}
}

function getSearchFromEngineObj(searchText, engineObj)
{
	for (var key in sss.engines) {
		var engine = sss.engines[key];
		if (engine.name === engineObj.name) {
			return engine.getSubmission(searchText).uri.spec;
		}
	}
}

/* ------------------------------------ */
/* ------------------------------------ */
/* ------------------------------------ */

})();
