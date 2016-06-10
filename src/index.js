(function() {

/* ==================================== */
/* ====== Swift Selection Search ====== */
/* ==================================== */

setup_Requires();
setup_Preferences();
setup_ContextMenu();
setup_PopupPanel();

/* ------------------------------------ */
/* ------------- IMPORTS -------------- */
/* ------------------------------------ */

function setup_Requires()
{
	// Cc,Ci,Cu are used to get the installed search engines and open their management panel.
	const {Cc,Ci/*,Cu*/} = require("chrome");

	this.searchService = Cc["@mozilla.org/browser/search-service;1"]
		.getService(Ci.nsIBrowserSearchService);

	this.self = require("sdk/self");
	this.data = self.data;
	this.tabs = require("sdk/tabs");
	this.pageMod = require("sdk/page-mod");
	this.selection = require("sdk/selection");
	this.panel = require("sdk/panel");
	this.simplePrefs = require('sdk/simple-prefs');
	this.simpleStorage = require("sdk/simple-storage");
	this.contextMenu = require("sdk/context-menu");
	this.Hotkey = require("sdk/hotkeys");
}

/* ------------------------------------ */
/* ------------- SETTINGS ------------- */
/* ------------------------------------ */

function setup_Preferences()
{
	// importOldPreferences();

	this.PopupBehaviour_Off = 0;
	this.PopupBehaviour_Auto = 1;
	this.PopupBehaviour_Mouse = 2;
	this.PopupBehaviour_Keyboard = 3;

	this.showPanelHotkey = undefined;

	if (simpleStorage.storage.searchEngines) {
		purgeNonExistentEngines();
	} else {
		simpleStorage.storage.searchEngines = {};
	}

	setPreferencesCallbacks();
}

// function importOldPreferences()
// {
// 	var prefix = "extensions.dlobo.sss.";

// 	var translations = {
// 		"popupPanelOpenBehavior"     : prefix + "popupPanelOpenBehavior",
// 		"popupPanelHotkey"           : prefix + "popupPanelHotkey",
// 		"hidePopupPanelOnPageScroll" : prefix + "hidePopupPanelOnPageScroll",
// 		"openEngineManager"          : prefix + "openEngineManager",
// 		"selectEnginesButton"        : prefix + "selectEnginesButton",
// 		"mouseLeftButtonBehavior"    : prefix + "mouseLeftButtonBehavior",
// 		"mouseMiddleButtonBehavior"  : prefix + "mouseMiddleButtonBehavior",
// 		"itemSize"                   : prefix + "itemSize",
// 		"itemPadding"                : prefix + "itemPadding",
// 		"useSingleRow"               : prefix + "useSingleRow",
// 		"nItemsPerRow"               : prefix + "nItemsPerRow",
// 		"popupPaddingX"              : prefix + "popupPaddingX",
// 		"popupPaddingY"              : prefix + "popupPaddingY",
// 		"doHorizontalCentering"      : prefix + "doHorizontalCentering",
// 		"enableEnginesInContextMenu" : prefix + "enableEnginesInContextMenu",
// 		"contextMenuItemBehavior"    : prefix + "contextMenuItemBehavior"
// 	}

// 	for (var key in translations) {
// 		if (translations.hasOwnProperty(key)) {
// 			var value = translations[key];
// 			if (simplePrefs.prefs[key] !== undefined) {
// 				// console.log("new preference " + value + " created from " + key);
// 				// simplePrefs.prefs[value] = simplePrefs.prefs[key];
// 			}
// 		}
// 	}
// }

function setPreferencesCallbacks()
{
	simplePrefs.on("", function() {
		destroyPopupPanel();
	});

	simplePrefs.on("popupPanelHotkey", function() {
		setShowPanelHotkey();
		destroyPopupPanel();
	});

	simplePrefs.on("popupPanelOpenBehavior", function() {
		if (isPopupPanelEnabled()) {
			setShowPanelHotkey();
			setPopupPanelPageMod();
		} else {
			destroyPopupPanel();
			popupPanelPageMod.destroy();
			destroyPageWorkers();
		}
	});

	simplePrefs.on("enableEnginesInContextMenu", function() {
		if (simplePrefs.prefs['enableEnginesInContextMenu'] === true) {
			createContextMenu();
		} else if (searchMenu != null) {
			searchMenu.destroy();
			searchMenu = null;
		}
	});

	simplePrefs.on("selectEnginesButton", function() {
		createSettingsPanel();
		destroyPopupPanel();
	});

	simplePrefs.on("openEngineManager", function() {
		// Cu.import("resource://gre/modules/Services.jsm");
		// Services.wm.getMostRecentWindow('navigator:browser')
		// 	.BrowserSearch.searchBar.openManager();
		tabs.open({url: "about:preferences#search"});
		destroyPopupPanel();
	});
}

function setShowPanelHotkey()
{
	if (showPanelHotkey) {
		showPanelHotkey.destroy();
	}

	if (isPopupPanelEnabled()) {
		var hotkey = simplePrefs.prefs['popupPanelHotkey'];
		if (!hotkey) {
			return;
		}

		try {
			showPanelHotkey = Hotkey({
				combo: hotkey,
				onPress: function() {
					if (activeWorker != null && selection.text) {
						activeWorker.port.emit("onSelection");
					}
				}
			});
		} catch (e) {}
	}
}

function createSettingsPanel()
{
	var visibleEngines = searchService.getVisibleEngines({});

	var engineObjects = visibleEngines.map(function(engine) {
		var engineObject = {};
		engineObject.name = engine.name;
		engineObject.iconSpec = (engine.iconURI != null ? engine.iconURI.spec : null);
		engineObject.active = isEngineActive(engine);
		return engineObject;
	});

	var calculatedHeight = engineObjects.length * 20 + 100;
	if (calculatedHeight > 450) {
		calculatedHeight = 450;
	}

	var pan = panel.Panel({
		contentURL: data.url("engine-settings.html"),
		contentScriptFile: data.url("engine-settings.js"),
		height: calculatedHeight
	});

	pan.port.emit('setupSettingsPanel', engineObjects);
	pan.port.on("onSearchEngineToggle", onSearchEngineToggle);

	pan.show();
}

function onSearchEngineToggle(engine)
{
	simpleStorage.storage.searchEngines[engine.name] = engine.active;
}

function isEngineActive(engine)
{
	if (!simpleStorage.storage.searchEngines.hasOwnProperty(engine.name)) {
		simpleStorage.storage.searchEngines[engine.name] = true;
	}
	return simpleStorage.storage.searchEngines[engine.name];
}

function purgeNonExistentEngines()
{
	var visibleEngineNames = searchService.getVisibleEngines({})
		.map(function(engine) { return engine.name; });

	for (var engineName in simpleStorage.storage.searchEngines) {
		if (visibleEngineNames.indexOf(engineName) == -1) {
			delete simpleStorage.storage.searchEngines[engineName];
		}
	}
}

/* ------------------------------------ */
/* ----------- CONTEXT MENU ----------- */
/* ------------------------------------ */

function setup_ContextMenu()
{
	if (simplePrefs.prefs['enableEnginesInContextMenu'] === true) {
		createContextMenu();
	}
}

function createContextMenu()
{
	var visibleEngines = searchService.getVisibleEngines({});
	var items = [];

	for (var i = 0; i < visibleEngines.length; i++)
	{
		let engine = visibleEngines[i];

		if (!engine.hidden)
		{
			var itemObject = {
				label: engine.name,
				contentScript:
					'self.on("click", function (node) {' +
					'	self.postMessage(window.getSelection().toString());' +
					'});',
				onMessage: function (selectionText) {
					var search = engine.getSubmission(selectionText).uri.spec;
					openSearch(search, simplePrefs.prefs['contextMenuItemBehavior']);
				}
			};

			if (engine.iconURI != null) {
				itemObject.image = engine.iconURI.spec;
			}

			items.push(contextMenu.Item(itemObject));
		}
	}

	searchMenu = contextMenu.Menu({
		label: "Search With...",
		context: contextMenu.SelectionContext(),
		items: items
		// image: data.url("context-icon-16.png")
	});
}

/* ------------------------------------ */
/* ----------- POPUP PANEL ------------ */
/* ------------------------------------ */

function setup_PopupPanel()
{
	this.workers = [];
	this.activeWorker = null;

	if (isPopupPanelEnabled()) {
		setShowPanelHotkey();
		setPopupPanelPageMod();
	}
}

function isPopupPanelEnabled()
{
	return simplePrefs.prefs['popupPanelOpenBehavior'] != PopupBehaviour_Off;
}

function setPopupPanelPageMod()
{
	popupPanel = null;
	activeWorker = null;
	var workerID = 0;

	popupPanelPageMod = pageMod.PageMod({
		include: "*",
		contentScriptFile: data.url("selection-worker.js"),
		attachTo: ["existing", "top"],
		contentScriptWhen: "ready",
		onAttach: function(worker)
		{
			// console.log("attach " + worker.tab.title);
			workers.push(worker);
			worker.id = workerID++;

			worker.onSelection = function() {
				// console.log(selection.text + " from " + worker.id);
				if (selection.text && simplePrefs.prefs['popupPanelOpenBehavior'] == PopupBehaviour_Auto) {
					worker.port.emit("onSelection");
				}
			}

			worker.activateWorker = function() {
				if (worker.tab == null) {
					return;
				}

				if (worker.tab.id != tabs.activeTab.id) {
					return;
				}

				if (activeWorker != null) {
					activeWorker.deactivateWorker();
				}

				// if (activeWorker) {
				// 	if (worker === activeWorker) {
				// 		console.log("already the active worker");
				// 		return;
				// 	}
				// 	activeWorker.deactivateWorker();
				// }

				activeWorker = worker;
				// console.log("activateWorker " + worker.id);
				worker.port.on("onAcquiredSelectionInfo", showPopupPanel);
				selection.on('select', worker.onSelection);
			}

			worker.deactivateWorker = function() {
				// console.log("deactivateWorker " + worker.id);
				worker.port.removeListener("onAcquiredSelectionInfo", showPopupPanel);
				selection.removeListener('select', worker.onSelection);
				activeWorker = null;
			}

			worker.on('pageshow', function() {
				// console.log("pageshow " + worker.tab.title);
				worker.activateWorker();
			});

			worker.tab.on('activate', function() {
				// console.log("activate " + worker.tab.title);
				worker.activateWorker();
			});

			worker.on('detach', function () {
				var index = workers.indexOf(worker);
				if (index != -1) {
					workers.splice(index, 1);
				}
			});

			worker.activateWorker();
		}
	});
}

function onPageScroll()
{
	if (popupPanel != null && popupPanel.isShowing) {
		hidePopupPanel();
	}
}

function destroyPageWorkers()
{
	var tmpWorkers = [];
	for (var i in workers) {
		worker = workers[i];
		worker.deactivateWorker();
		tmpWorkers.push(worker);
	}
	for (var i in tmpWorkers) {
		tmpWorkers[i].destroy();
	}
	workers = [];
}

function createPopupPanel()
{
	var visibleEngines = searchService.getVisibleEngines({});
	var engines = visibleEngines.filter(function(engine) { return isEngineActive(engine); });

	popupPanel_engines = engines;

	var opt = createOptionsObjectFromPrefs();

	opt.nItemsPerRow = (opt.useSingleRow ? engines.length : opt.nItemsPerRow);
	var height = (opt.itemSize + 8) * Math.ceil(engines.length / opt.nItemsPerRow) + opt.popupPaddingY * 2;
	var width = (opt.itemSize + opt.itemPadding * 2) * opt.nItemsPerRow + opt.popupPaddingX * 2;

	opt.hoverBehavior = simplePrefs.prefs["itemHoverBehavior"];

	popupPanel_opt = opt;

	popupPanel = panel.Panel({
		contentURL: data.url("popup.html"),
		contentScriptFile: data.url("popup.js"),
		height: height,
		width: width,
		focus: false
	});

	var engineObjs = engines.map(function(engine) { return convertEngineToObject(engine); });

	popupPanel.port.emit('setupPanel', opt, engineObjs);
	// popupPanel.port.emit('logInnerHTML', opt, engineObjs);
	popupPanel.port.on("onSearchEngineLeftClick", onSearchEngineLeftClick);
	popupPanel.port.on("onSearchEngineMiddleClick", onSearchEngineMiddleClick);
}

function showPopupPanel(selectionText, position)
{
	if (popupPanel == null) {
		createPopupPanel();
	}

	var opt = popupPanel_opt;

	if (opt.doHorizontalCentering) {
		position.left -= popupPanel.width / 2;
	}

	position.left += opt.popupOffsetX;
	position.top  -= opt.popupOffsetY;

	popupPanel_selectionText = selectionText;

	popupPanel.show({position: position});

	if (simplePrefs.prefs["hidePopupPanelOnPageScroll"] === true) {
		activeWorker.port.emit('registerOnPageScroll');
		activeWorker.port.on("onPageScroll", onPageScroll);
	}
}

function hidePopupPanel()
{
	popupPanel.hide();
	if (simplePrefs.prefs["hidePopupPanelOnPageScroll"] === true) {
		activeWorker.port.emit('deregisterOnPageScroll');
		activeWorker.port.removeListener("onPageScroll", onPageScroll);
	}
}

function destroyPopupPanel()
{
	if (popupPanel != null) {
		hidePopupPanel();
		popupPanel.destroy();
		popupPanel = null;
	}
}

function convertEngineToObject(engine)
{
	var engineObj = {};
	engineObj.name = engine.name;
	engineObj.iconSpec = (engine.iconURI != null ? engine.iconURI.spec : null);
	return engineObj;
}

function createOptionsObjectFromPrefs()
{
	var opt = {};

	opt.popupOffsetX = simplePrefs.prefs['popupOffsetX'];
	opt.popupOffsetY = simplePrefs.prefs['popupOffsetY'];

	if (simplePrefs.prefs['negatePopupOffsetX'] === true) {
		opt.popupOffsetX = -opt.popupOffsetX;
	}
	if (simplePrefs.prefs['negatePopupOffsetY'] === true) {
		opt.popupOffsetY = -opt.popupOffsetY;
	}

	opt.popupPaddingX = simplePrefs.prefs['popupPaddingX'];
	opt.popupPaddingY = simplePrefs.prefs['popupPaddingY'];
	opt.doHorizontalCentering = simplePrefs.prefs['doHorizontalCentering'];

	opt.itemSize = simplePrefs.prefs['itemSize'];
	opt.itemPadding = simplePrefs.prefs['itemPadding'];
	opt.useSingleRow = simplePrefs.prefs['useSingleRow'];
	opt.nItemsPerRow = simplePrefs.prefs['nItemsPerRow'];

	return opt;
}

function onSearchEngineLeftClick(engineObj)
{
	search(engineObj, simplePrefs.prefs['mouseLeftButtonBehavior']);
}

function onSearchEngineMiddleClick(engineObj)
{
	search(engineObj, simplePrefs.prefs['mouseMiddleButtonBehavior']);
}

function search(engineObj, behavior)
{
	var search = getSearchFromEngineObj(engineObj, popupPanel_selectionText);
	openSearch(search, behavior);
	if (simplePrefs.prefs['hidePopupPanelOnSearch'] === true) {
		hidePopupPanel();
	}
}

function openSearch(search, behavior)
{
	switch (behavior)
	{
		case 0:
			tabs.activeTab.url = search;
			break;
		case 1:
			tabs.open({url: search});
			break;
		case 2:
			tabs.open({url: search, inBackground: true});
			break;
	}
}

function getSearchFromEngineObj(engineObj, query)
{
	for (var key in popupPanel_engines) {
		var engine = popupPanel_engines[key];
		if (engine.name == engineObj.name) {
			return engine.getSubmission(query).uri.spec;
		}
	}
}

/* ------------------------------------ */
/* ------------------------------------ */
/* ------------------------------------ */

})();
