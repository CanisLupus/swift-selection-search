"use strict";

let form = {};

document.addEventListener("DOMContentLoaded", onPageLoaded);

function onPageLoaded()
{
	// clear all settings (for test purposes)
	browser.storage.local.clear();

	// save all form elements for easy access
	form.formElement = document.getElementById("settings-form");
	form.inputs = document.querySelectorAll("input, select");

	for (let item of form.inputs) {
		form[item.name] = item;
	}

	// register change event for anything in the form
	form.formElement.onchange = function onFormChanged(ev) {
		let item = ev.target;
		if (item.type != "color") {
			console.log("onFormChanged target: " + item.name);
			browser.storage.local.set({ [item.name]: item.value });
		}
	};

	// register events for specific behaviour when certain fields change
	form.popupPanelBackgroundColorPicker.oninput = function(ev) { updateColorText  (form.popupPanelBackgroundColor,       form.popupPanelBackgroundColorPicker.value); };
	form.popupPanelBackgroundColor.oninput       = function(ev) { updatePickerColor(form.popupPanelBackgroundColorPicker, form.popupPanelBackgroundColor.value);       };
	form.popupPanelHighlightColorPicker.oninput  = function(ev) { updateColorText  (form.popupPanelHighlightColor,        form.popupPanelHighlightColorPicker.value);  };
	form.popupPanelHighlightColor.oninput        = function(ev) { updatePickerColor(form.popupPanelHighlightColorPicker,  form.popupPanelHighlightColor.value);        };

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
	browser.storage.local.get().then(updateUIWithSettings, handleError);
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

	updatePickerColor(form.popupPanelBackgroundColorPicker, form.popupPanelBackgroundColor.value);
	updatePickerColor(form.popupPanelHighlightColorPicker, form.popupPanelHighlightColor.value);
}

function storeSettings()
{
	let settings = {}

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

function updateColorText(text, value)
{
	value = value.toUpperCase();

	if (text.value !== value) {
		text.value = value;
		browser.storage.local.set({ [text.name]: value });
	}
}

function updatePickerColor(picker, value)
{
	value = value.substring(0, 7);

	if (picker.value !== value) {
		picker.value = value;
	}
}

// function createEngineSelectionPanel()
// {
// 	let visibleEngines = sdk.searchService.getVisibleEngines({});

// 	let engineObjects = visibleEngines.map(function(engine) {
// 		return {
// 			name: engine.name,
// 			iconSpec: (engine.iconURI !== null ? engine.iconURI.spec : null),
// 			active: isEngineActive(engine)
// 		}
// 	});

// 	let calculatedHeight = engineObjects.length * 20 + 100;
// 	if (calculatedHeight > 450) {
// 		calculatedHeight = 450;
// 	}

// 	let panel = sdk.panel.Panel({
// 		contentURL: sdk.data.url("engine-settings.html"),
// 		contentScriptFile: sdk.data.url("engine-settings.js"),
// 		height: calculatedHeight
// 	});

// 	panel.port.emit("setupSettingsPanel", engineObjects);
// 	panel.port.on("onSearchEngineToggle", onSearchEngineToggle);

// 	panel.show();
// }
