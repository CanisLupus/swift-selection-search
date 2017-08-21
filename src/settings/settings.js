"use strict";

var form = {};

document.addEventListener("DOMContentLoaded", onPageLoaded);

function onPageLoaded()
{
	// clear all settings (for test purposes)
	// browser.storage.local.clear();

	// save all form elements for easy access
	form.formElement = document.getElementById("settings-form");
	form.inputs = document.querySelectorAll("input, select");

	for (let item of form.inputs) {
		form[item.name] = item;
	}

	// register change event for anything in the form
	form.formElement.onchange = function onFormChanged(ev) {
		console.log("onFormChanged target: " + ev.target.name);
		var item = ev.target;
		browser.storage.local.set({ [item.name]: item.value });
	};

	// register events for specific behaviour when certain fields change
	form.popupPanelBackgroundColorPicker.oninput = function(ev) { updateIfDifferent(form.popupPanelBackgroundColor,       form.popupPanelBackgroundColorPicker); };
	form.popupPanelBackgroundColor.oninput       = function(ev) { updateIfDifferent(form.popupPanelBackgroundColorPicker, form.popupPanelBackgroundColor); };
	form.popupPanelHighlightColorPicker.oninput  = function(ev) { updateIfDifferent(form.popupPanelHighlightColor,        form.popupPanelHighlightColorPicker); };
	form.popupPanelHighlightColor.oninput        = function(ev) { updateIfDifferent(form.popupPanelHighlightColorPicker,  form.popupPanelHighlightColor); };

	// register events for button clicks
	form.openEngineManager.onclick = function(ev) {
		/**/
	};

	form.selectEnginesButton.onclick = function(ev) {
		/**/
	};

	form.resetAllSettings.onclick = function(ev) {
		ev.preventDefault();
		form.formElement.reset();
		storeSettings();
	};

	// load settings
	const gettingStoredSettings = browser.storage.local.get();
	gettingStoredSettings.then(updateUIWithSettings, handleError);
}

function handleError(error)
{
	console.log(`Error: ${error}`);
}

function updateUIWithSettings(settings)
{
	console.log(settings);

	for (let item of form.inputs) {
		if (item.type == "select-one") {
			if (item.name in settings) {
				item.value = settings[item.name];
			}
		}
		else if (item.type != "color" && item.type != "button" && item.type != "reset") {
			if (item.name in settings) {
				if (item.type == "checkbox") {
					item.checked = settings[item.name];
				} else {
					item.value = settings[item.name];
				}
			}
		}
	}

	form.popupPanelBackgroundColorPicker.value = form.popupPanelBackgroundColor.value;
	form.popupPanelHighlightColorPicker.value = form.popupPanelHighlightColor.value;
}

function storeSettings()
{
	var settings = {}

	for (let item of form.inputs) {
		if (item.type == "select-one") {
			settings[item.name] = item.options[item.selectedIndex].value;
		}
		else if (item.type != "color" && item.type != "button" && item.type != "reset") {
			if (item.type == "checkbox") {
				settings[item.name] = item.checked;
			} else if (item.type == "number") {
				settings[item.name] = parseInt(item.value);
			} else {
				settings[item.name] = item.value;
			}
		}
	}

	browser.storage.local.set(settings);

	console.log("saved");
}

function updateIfDifferent(target, source)
{
	if (target.value !== source.value) {
		console.log("target " + target.name + ", source: " + source.name);
		target.value = source.value;
	}
}

// function createEngineSelectionPanel()
// {
// 	var visibleEngines = sdk.searchService.getVisibleEngines({});

// 	var engineObjects = visibleEngines.map(function(engine) {
// 		return {
// 			name: engine.name,
// 			iconSpec: (engine.iconURI !== null ? engine.iconURI.spec : null),
// 			active: isEngineActive(engine)
// 		}
// 	});

// 	var calculatedHeight = engineObjects.length * 20 + 100;
// 	if (calculatedHeight > 450) {
// 		calculatedHeight = 450;
// 	}

// 	var panel = sdk.panel.Panel({
// 		contentURL: sdk.data.url("engine-settings.html"),
// 		contentScriptFile: sdk.data.url("engine-settings.js"),
// 		height: calculatedHeight
// 	});

// 	panel.port.emit('setupSettingsPanel', engineObjects);
// 	panel.port.on("onSearchEngineToggle", onSearchEngineToggle);

// 	panel.show();
// }
