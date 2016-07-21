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
	// Cc and Ci are used to get the installed search engines.
	const {Cc,Ci} = require("chrome");
	this.searchService = Cc["@mozilla.org/browser/search-service;1"]
		.getService(Ci.nsIBrowserSearchService);

	this.self = require("sdk/self");
	this.data = this.self.data;
	this.tabs = require("sdk/tabs");
	this.pageMod = require("sdk/page-mod");
	this.selection = require("sdk/selection");
	this.panel = require("sdk/panel");
	this.simplePrefs = require('sdk/simple-prefs');
	this.simpleStorage = require("sdk/simple-storage");
	this.contextMenuSdk = require("sdk/context-menu");
	this.Hotkey = require("sdk/hotkeys");
	this.clipboard = require("sdk/clipboard");
}

/* ------------------------------------ */
/* ------------- SETTINGS ------------- */
/* ------------------------------------ */

function setup_Preferences()
{
	this.PopupBehaviour_Off = 0;
	this.PopupBehaviour_Auto = 1;
	// this.PopupBehaviour_Mouse = 2;
	this.PopupBehaviour_Keyboard = 3;

	this.panelHotkey = undefined;
	this.disablePanelHotkey = undefined;
	this.options = createOptionsObjectFromPrefs();

	if (simpleStorage.storage.searchEngines) {
		purgeNonExistentEngines();
	} else {
		simpleStorage.storage.searchEngines = {};
	}

	setCallbacksForPreferences();
}

function setCallbacksForPreferences()
{
	// any change should recreate the popup panel
	simplePrefs.on("", function() {
		setup_PopupPanel();
	});

	simplePrefs.on("selectEnginesButton", function() {
		createSettingsPanel();
	});

	simplePrefs.on("openEngineManager", function() {
		tabs.open({url: "about:preferences#search"});
	});

	simplePrefs.on("enableEnginesInContextMenu", function() {
		setup_ContextMenu();
	});
}

function setShowPanelHotkey()
{
	console.log("setShowPanelHotkey");

	if (this.panelHotkey) {
		this.panelHotkey.destroy();
		this.panelHotkey = undefined;
	}

	if (simplePrefs.prefs['popupPanelOpenBehavior'] != PopupBehaviour_Off) {
		var hotkey = simplePrefs.prefs['popupPanelHotkey'];
		if (!hotkey) {
			return;
		}

		// try {
			this.panelHotkey = this.Hotkey.Hotkey({
				combo: hotkey,
				onPress: function() {
					if (activeWorker) {
						activeWorker.onSelection();
					}
				}
			});
		// } catch (e) {}
	}
}

function setDisablePanelHotkey()
{
	console.log("setDisablePanelHotkey");

	if (this.disablePanelHotkey) {
		this.disablePanelHotkey.destroy();
		this.disablePanelHotkey = undefined;
	}

	if (simplePrefs.prefs['popupPanelOpenBehavior'] != PopupBehaviour_Off) {
		var hotkey = simplePrefs.prefs['popupPanelDisableHotkey'];
		if (!hotkey) {
			return;
		}

		// try {
			this.disablePanelHotkey = this.Hotkey.Hotkey({
				combo: hotkey,
				onPress: function() {
					console.log("on press disable hotkey");
					options.isPopupPanelDisabled = !options.isPopupPanelDisabled;
					if (activeWorker) {
						activeWorker.port.emit("destroyPopupPanel");
					}
				}
			});
		// } catch (e) {}
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
	if (this.contextMenu) {
		this.contextMenu.destroy();
		this.contextMenu = undefined;
	}
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
					'self.on("click", function(node) {' +
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

			items.push(contextMenuSdk.Item(itemObject));
		}
	}

	this.contextMenu = contextMenuSdk.Menu({
		label: "Search With...",
		context: contextMenuSdk.SelectionContext(),
		items: items
		// image: data.url("context-icon-16.png")
	});
}

/* ------------------------------------ */
/* ----------- POPUP PANEL ------------ */
/* ------------------------------------ */

function setup_PopupPanel()
{
	console.log("setup_PopupPanel");
	if (this.workers != undefined) {
		destroyPageWorkers();
	}

	this.workers = [];
	this.activeWorker = undefined;

	if (this.popupPanelPageMod) {
		this.popupPanelPageMod.destroy();
		this.popupPanelPageMod = undefined;
	}

	if (simplePrefs.prefs['popupPanelOpenBehavior'] != PopupBehaviour_Off) {
		setShowPanelHotkey();
		setDisablePanelHotkey();
		setPopupPanelPageMod();
	}
}

function setPopupPanelPageMod()
{
	console.log("setPopupPanelPageMod");
	// globals
	this.activeWorker = undefined;
	this.engines = undefined;

	var workerID = 0;

	this.popupPanelPageMod = pageMod.PageMod({
		include: "*",
		contentScriptFile: data.url("selection-worker.js"),
		attachTo: ["existing", "top"],
		contentScriptWhen: "ready",
		onAttach: function(worker)
		{
			workers.push(worker);
			worker.id = workerID++;
			console.log("onAttach " + worker.id);

			worker.onSelection = function() {
				console.log("onSelection " + options.isPopupPanelDisabled);
				if (options.isPopupPanelDisabled) {
					return;
				}

				console.log("onSelection " + worker.id);
				if (selection.text)
				{
					var visibleEngines = searchService.getVisibleEngines({});
					engines = visibleEngines.filter(function(engine) { return isEngineActive(engine); });
					var engineObjs = engines.map(function(engine) { return convertEngineToObject(engine); });

					worker.port.emit("onSelection", options, engineObjs);

					if (simplePrefs.prefs['autoCopyToClipboard']) {
						clipboard.set(selection.text);
					}
				}
			}

			worker.activateWorker = function() {
				if (!worker.tab) {
					return;
				}
				if (worker.tab.id != tabs.activeTab.id) {
					return;
				}

				console.log("activateWorker " + worker.id);

				if (activeWorker != null) {
					activeWorker.deactivateWorker();
				}

				activeWorker = worker;

				worker.port.on("onSearchEngineLeftClick", onSearchEngineLeftClick);
				worker.port.on("onSearchEngineMiddleClick", onSearchEngineMiddleClick);
				worker.port.on("onSearchEngineCtrlClick", onSearchEngineCtrlClick);
				if (simplePrefs.prefs['popupPanelOpenBehavior'] == PopupBehaviour_Auto) {
					selection.on('select', worker.onSelection);
				}
			}

			worker.deactivateWorker = function() {
				console.log("deactivateWorker");
				if (activeWorker) {
					activeWorker.port.emit("destroyPopupPanel");
				}
				worker.port.removeListener("onSearchEngineLeftClick", onSearchEngineLeftClick);
				worker.port.removeListener("onSearchEngineMiddleClick", onSearchEngineMiddleClick);
				worker.port.removeListener("onSearchEngineCtrlClick", onSearchEngineCtrlClick);
				selection.removeListener('select', worker.onSelection);
			}

			worker.on('pageshow', function() {
				console.log("pageshow " + worker.id);
				worker.activateWorker();
			});

			if (worker.tab) {	// fix for settings change
				worker.tab.on('activate', function() {
					console.log("activate tab " + worker.id);
					worker.activateWorker();
				});
			}

			worker.on('detach', function () {
				console.log("detach " + worker.id);
				var index = workers.indexOf(worker);
				if (index != -1) {
					workers.splice(index, 1);
				}
			});

			worker.activateWorker();
		}
	});
}

function destroyPageWorkers()
{
	console.log("destroyPageWorkers");
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
	this.activeWorker = undefined;
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

	opt.popupPaddingX = simplePrefs.prefs['popupPaddingX'];
	opt.popupPaddingY = simplePrefs.prefs['popupPaddingY'];
	opt.doHorizontalCentering = simplePrefs.prefs['doHorizontalCentering'];

	opt.popupPanelAnimationDuration = simplePrefs.prefs['popupPanelAnimationDuration'];
	opt.itemSize = simplePrefs.prefs['itemSize'];
	opt.itemPadding = simplePrefs.prefs['itemPadding'];
	opt.useSingleRow = simplePrefs.prefs['useSingleRow'];
	opt.nItemsPerRow = simplePrefs.prefs['nItemsPerRow'];

	opt.hoverBehavior = simplePrefs.prefs["itemHoverBehavior"];
	opt.popupLocation = simplePrefs.prefs["popupLocation"];
	opt.hidePopupPanelOnPageScroll = simplePrefs.prefs["hidePopupPanelOnPageScroll"];
	opt.hidePopupPanelOnSearch = simplePrefs.prefs["hidePopupPanelOnSearch"];

	opt.isPopupPanelDisabled = false;

	return opt;
}

function onSearchEngineLeftClick(searchText, engineObj)
{
	console.log("onSearchEngineLeftClick");
	search(searchText, engineObj, simplePrefs.prefs['mouseLeftButtonBehavior']);
}

function onSearchEngineMiddleClick(searchText, engineObj)
{
	console.log("onSearchEngineMiddleClick");
	search(searchText, engineObj, simplePrefs.prefs['mouseMiddleButtonBehavior']);
}

function onSearchEngineCtrlClick(searchText, engineObj)
{
	console.log("onSearchEngineCtrlClick");
	search(searchText, engineObj, 2);
}

function search(searchText, engineObj, behavior)
{
	console.log("search");
	var searchUrl = getSearchFromEngineObj(engineObj, searchText);
	openSearch(searchUrl, behavior);
}

function openSearch(searchUrl, behavior)
{
	console.log("openSearch");
	switch (behavior)
	{
		case 0: tabs.activeTab.url = searchUrl; break;
		case 1: tabs.open({ url: searchUrl }); break;
		case 2: tabs.open({ url: searchUrl, inBackground: true }); break;
	}
}

function getSearchFromEngineObj(engineObj, query)
{
	for (var key in this.engines) {
		var engine = this.engines[key];
		if (engine.name == engineObj.name) {
			return engine.getSubmission(query).uri.spec;
		}
	}
}

/* ------------------------------------ */
/* ------------------------------------ */
/* ------------------------------------ */

})();
