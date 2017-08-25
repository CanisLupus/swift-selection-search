"use strict";

let page = {};
let mainScript = browser.extension.getBackgroundPage();
let hasPageLoaded = false;
let settings;

// Load settings. Either the last of both onSettingsAcquired and onPageLoaded will update the UI with the loaded settings.
browser.storage.local.get().then(onSettingsAcquired, mainScript.getErrorHandler("Error getting settings in settings page."));

document.addEventListener("DOMContentLoaded", onPageLoaded);

function onPageLoaded()
{
	// save all form elements for easy access
	page.container = document.getElementById("settings");
	page.engines = document.getElementById("engines");
	page.inputs = document.querySelectorAll("input, select");

	for (let item of page.inputs) {
		page[item.name] = item;
	}

	// register change event for anything in the form
	page.container.onchange = function onFormChanged(ev) {
		let item = ev.target;
		if (item.type !== "color") {
			console.log("onFormChanged target: " + item.name + ", value: " + item.value);
			browser.storage.local.set({ [item.name]: item.value });
		}
	};

	// register events for specific behaviour when certain fields change
	page.popupPanelBackgroundColorPicker.oninput = function(ev) { updateColorText  (page.popupPanelBackgroundColor,       page.popupPanelBackgroundColorPicker.value); };
	page.popupPanelBackgroundColor.oninput       = function(ev) { updatePickerColor(page.popupPanelBackgroundColorPicker, page.popupPanelBackgroundColor.value);       };
	page.popupPanelHighlightColorPicker.oninput  = function(ev) { updateColorText  (page.popupPanelHighlightColor,        page.popupPanelHighlightColorPicker.value);  };
	page.popupPanelHighlightColor.oninput        = function(ev) { updatePickerColor(page.popupPanelHighlightColorPicker,  page.popupPanelHighlightColor.value);        };

	// register events for button clicks
	page.addEngineButton.onclick = function(ev) {
		settings.searchEngines.push(
			{
				name: "Wikipedia",
				iconUrl: "http://findicons.com/files/icons/111/popular_sites/128/wikipedia_icon.png",
				searchUrl: "https://en.wikipedia.org/wiki/Special:Search?search={searchText}",
				isEnabled: true,
			}
		);
		browser.storage.local.set({ searchEngines: settings.searchEngines });
		updateUIWithSettings();
	};

	page.resetAllSettingsButton.onclick = function(ev) {
		ev.preventDefault();
		settings = mainScript.getDefaultSettings();
		updateUIWithSettings();
		browser.storage.local.set(settings);
		console.log("saved");
	};

	// finish and set elements based on settings, if they are already loaded
	hasPageLoaded = true;

	if (settings !== undefined) {
		updateUIWithSettings();
	}
}

function onSettingsAcquired(_settings)
{
	settings = _settings;

	if (hasPageLoaded) {
		updateUIWithSettings();
	}
}

function updateUIWithSettings()
{
	console.log("updateUIWithSettings", settings);

	for (let item of page.inputs)
	{
		if (item.type == "select-one") {
			if (item.name in settings) {
				item.value = parseInt(settings[item.name]);
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

	updatePickerColor(page.popupPanelBackgroundColorPicker, page.popupPanelBackgroundColor.value);
	updatePickerColor(page.popupPanelHighlightColorPicker, page.popupPanelHighlightColor.value);

	if (settings.searchEngines !== undefined)
	{
		let engineElements = page.engines.getElementsByClassName("engine");
		while (engineElements.length > 0) {
			engineElements[0].remove();
		}

		for (let i = 0; i < settings.searchEngines.length; i++) {
			let engine = settings.searchEngines[i];
			addSearchEngine(engine, i);
		}

		sortable(page.engines, function(item) {
			console.log(item);
		});
	}
}

function addSearchEngine(engine, i)
{
	let row = document.createElement("tr");
	row.className = "engine";

	let cell;
	let input;

	cell = document.createElement("td");
	cell.className = "engine-dragger";
	input = document.createElement("div");
	input.textContent = "☰";
	cell.appendChild(input);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-is-enabled";
	input = document.createElement("input");
	input.type = "checkbox";
	input.checked = engine.isEnabled;
	input.autocomplete = "off";
	cell.appendChild(input);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-icon-img";
	let icon = document.createElement("img");
	icon.src = engine.iconUrl;
	cell.appendChild(icon);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-name";
	input = document.createElement("input");
	input.type = "text";
	// input.name = "engine"+(i+1)+"-name";
	input.value = engine.name;
	cell.appendChild(input);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-search-link";
	input = document.createElement("input");
	input.type = "text";
	// input.name = "engine"+(i+1)+"-search-link";
	input.value = engine.searchUrl;
	cell.appendChild(input);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-icon-link";
	input = document.createElement("input");
	input.type = "text";
	// input.name = "engine"+(i+1)+"-icon-link";
	input.value = engine.iconUrl;
	input.oninput = function(ev) {
		icon.src = input.value;
	};
	cell.appendChild(input);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-move-up";
	input = document.createElement("button");
	input.type = "button";
	input.textContent = "↑";
	if (i > 0) {
		input.onclick = function(ev) {
			if (i <= 0) {
				return;
			}
			console.log("↑", i);
			let tmp = settings.searchEngines[i];
			settings.searchEngines[i] = settings.searchEngines[i-1];
			settings.searchEngines[i-1] = tmp;
			browser.storage.local.set({ searchEngines: settings.searchEngines });
			updateUIWithSettings();
		};
	} else {
		input.style.opacity = 0.5;
	}
	cell.appendChild(input);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-move-down";
	input = document.createElement("button");
	input.type = "button";
	input.textContent = "↓";
	if (i < settings.searchEngines.length-1) {
		input.onclick = function(ev) {
			if (i >= settings.searchEngines.length-1) {
				return;
			}
			console.log("↓", i);
			let tmp = settings.searchEngines[i];
			settings.searchEngines[i] = settings.searchEngines[i+1];
			settings.searchEngines[i+1] = tmp;
			browser.storage.local.set({ searchEngines: settings.searchEngines });
			updateUIWithSettings();
		};
	} else {
		input.style.opacity = 0.5;
	}
	cell.appendChild(input);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-delete";
	input = document.createElement("button");
	input.type = "button";
	input.textContent = "✖";
	input.onclick = function(ev) {
		settings.searchEngines.splice(i, 1);	// remove element at i
		browser.storage.local.set({ searchEngines: settings.searchEngines });
		updateUIWithSettings();
	};
	cell.appendChild(input);
	row.appendChild(cell);

	page.engines.appendChild(row);
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

function sortable(rootEl, onUpdate)
{
	let dragged;

	function handleDragStart(ev) {
		console.log("handleDragStart", ev.target);
		// dragged = ev.target;
		ev.dataTransfer.effectAllowed = 'move';
	}
	function handleDragEnter(ev) {
		console.log("handleDragEnter", ev.target);
	}
	function handleDragOver(ev) {
		console.log("handleDragOver", ev.target);
		// ev.preventDefault();
		ev.dataTransfer.dropEffect = 'move';

		// let target = ev.target;
		// if (target && target !== dragEl && target.nodeName == 'th') {
		// 	let rect = target.getBoundingClientRect();
		// 	let next = (ev.clientY - rect.top)/(rect.bottom - rect.top) > .5;
		// 	rootEl.insertBefore(dragEl, next && target.nextSibling || target);
		// }
	}
	function handleDragLeave(ev) {
		console.log("handleDragLeave", ev.target);
	}
	function handleDrop(ev) {
		console.log("handleDrop", ev.target);
		// if (ev.stopPropagation) {
		// 	ev.stopPropagation(); // stops the browser from redirecting.
		// }
	}
	function handleDragEnd(ev) {
		console.log("handleDragEnd", ev.target);
	}

	for (let dragger of page.engines.getElementsByClassName("engine-dragger")) {
		dragger.draggable = true;
		console.log(dragger);
		dragger.addEventListener('dragstart', handleDragStart, false);
		dragger.addEventListener('dragenter', handleDragEnter, false);
		dragger.addEventListener('dragover', handleDragOver, false);
		dragger.addEventListener('dragleave', handleDragLeave, false);
		dragger.addEventListener('drop', handleDrop, false);
		dragger.addEventListener('dragend', handleDragEnd, false);
	}

	return;

	// function _onDragOver(evt) {
	// 	evt.preventDefault();
	// 	evt.dataTransfer.dropEffect = 'move';

	// 	let target = evt.target;
	// 	console.log(target.nodeName);
	// 	if (target && target !== dragEl && target.nodeName == 'th') {
	// 		let rect = target.getBoundingClientRect();
	// 		let next = (evt.clientY - rect.top)/(rect.bottom - rect.top) > .5;
	// 		rootEl.insertBefore(dragEl, next && target.nextSibling || target);
	// 	}
	// }

	// function _onDragEnd(evt) {
	// 	evt.preventDefault();

	// 	dragEl.classList.remove('ghost');
	// 	rootEl.removeEventListener('dragover', _onDragOver, false);
	// 	rootEl.removeEventListener('dragend', _onDragEnd, false);

	// 	if (nextEl !== dragEl.nextSibling) {
	// 		onUpdate(dragEl);
	// 	}
	// }

	// rootEl.addEventListener('dragstart', function(evt) {
	// 	dragEl = evt.target;
	// 	nextEl = dragEl.nextSibling;
	// 	console.log(dragEl, nextEl);

	// 	evt.dataTransfer.effectAllowed = 'move';
	// 	evt.dataTransfer.setData('Text', dragEl.textContent);

	// 	rootEl.addEventListener('dragover', _onDragOver, false);
	// 	rootEl.addEventListener('dragend', _onDragEnd, false);

	// 	setTimeout(function() {
	// 		dragEl.classList.add('ghost');
	// 	}, 0)
	// }, false);
}