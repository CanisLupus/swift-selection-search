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
		// if (page.engines.contains(item)) {
		// 	console.log("onFormChanged [settings] target: " + item.name + ", value: " + item.value);
		// 	browser.storage.local.set({ searchEngines: settings.searchEngines });
		// } else
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
				type: "custom",
				name: "Google",
				iconUrl: "http://iconshow.me/media/images/social/simple-icons/png/32/google.png",
				searchUrl: "https://www.google.pt/search?q={searchText}",
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

		Sortable.create(page.engines, {
			handle: ".engine-dragger",
			onEnd: function (ev) {
				settings.searchEngines.splice(ev.newIndex, 0, settings.searchEngines.splice(ev.oldIndex, 1)[0]);
				browser.storage.local.set({ searchEngines: settings.searchEngines });
				updateUIWithSettings();
			},
		});
	}
}

function addSearchEngine(engine, i)
{
	let row = document.createElement("tr");
	row.className = "engine";

	let cell;
	let input;

	let sssIcon = engine.type === "sss" ? mainScript.getSssIcon(engine.id) : undefined;

	cell = document.createElement("td");
	cell.className = "engine-dragger";
	let div = document.createElement("div");
	div.textContent = "☰";
	cell.appendChild(div);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-is-enabled";
	let isEnabledInput = document.createElement("input");
	isEnabledInput.type = "checkbox";
	isEnabledInput.checked = engine.isEnabled;
	isEnabledInput.autocomplete = "off";
	isEnabledInput.onchange = function(ev) {
		engine.isEnabled = isEnabledInput.checked;
		browser.storage.local.set({ searchEngines: settings.searchEngines });
	};
	cell.appendChild(isEnabledInput);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-icon-img";
	let icon = document.createElement("img");
	icon.src = sssIcon ? browser.extension.getURL(sssIcon.iconUrl) : engine.iconUrl;
	cell.appendChild(icon);
	row.appendChild(cell);

	if (engine.type === "custom")
	{
		cell = document.createElement("td");
		cell.className = "engine-name";
		let nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.value = engine.name;
		nameInput.onchange = function(ev) {
			engine.name = nameInput.value;
			browser.storage.local.set({ searchEngines: settings.searchEngines });
		};
		cell.appendChild(nameInput);
		row.appendChild(cell);

		cell = document.createElement("td");
		cell.className = "engine-search-link";
		let searchLinkInput = document.createElement("input");
		searchLinkInput.type = "text";
		searchLinkInput.value = engine.searchUrl;
		searchLinkInput.onchange = function(ev) {
			engine.searchUrl = searchLinkInput.value;
			browser.storage.local.set({ searchEngines: settings.searchEngines });
		};
		cell.appendChild(searchLinkInput);
		row.appendChild(cell);

		cell = document.createElement("td");
		cell.className = "engine-icon-link";
		let iconLinkInput = document.createElement("input");
		iconLinkInput.type = "text";
		iconLinkInput.value = engine.iconUrl;
		iconLinkInput.oninput = function(ev) {
			icon.src = iconLinkInput.value;
		};
		iconLinkInput.onchange = function(ev) {
			engine.iconUrl = iconLinkInput.value;
			browser.storage.local.set({ searchEngines: settings.searchEngines });
		};
		cell.appendChild(iconLinkInput);
		row.appendChild(cell);

		cell = document.createElement("td");
		cell.className = "engine-delete";
		let deleteButton = document.createElement("button");
		deleteButton.type = "button";
		deleteButton.textContent = "✖";
		deleteButton.onclick = function(ev) {
			settings.searchEngines.splice(i, 1);	// remove element at i
			browser.storage.local.set({ searchEngines: settings.searchEngines });
			updateUIWithSettings();
		};
		cell.appendChild(deleteButton);
		row.appendChild(cell);
	}
	else if (engine.type === "sss")
	{
		cell = document.createElement("td");
		cell.className = "engine-native";
		cell.textContent = sssIcon.name;
		row.appendChild(cell);

		cell = document.createElement("td");
		cell.className = "engine-native";
		cell.colSpan = 2;
		cell.textContent = sssIcon.description;
		row.appendChild(cell);
	}

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

// function sortable(rootEl, onUpdate)
// {
// 	let dragged;

// 	function handleDragStart(ev) {
// 		console.log("handleDragStart", ev.target, this);
// 		// dragged = ev.target;
// 		ev.dataTransfer.effectAllowed = 'move';
// 		ev.dataTransfer.setData('text/plain', 'dummy');
// 	}
// 	function handleDragEnter(ev) {
// 		console.log("handleDragEnter", ev.target);
// 		ev.preventDefault();
// 		if (ev.stopPropagation) {
// 			ev.stopPropagation();
// 		}
// 		return false;
// 	}
// 	function handleDragOver(ev) {
// 		console.log("handleDragOver", ev.target);
// 		ev.preventDefault();
// 		ev.dataTransfer.dropEffect = 'move';

// 		if (ev.target.engineElement && this != ev.target) {
// 			console.log("handleDragOver", this.engineElement.innerHTML, ev.target.engineElement.innerHTML);
// 			page.engines.insertBefore(this.engineElement, ev.target.engineElement);
// 			// let target = ev.target;
// 			// if (target && target !== dragEl && target.nodeName == 'th') {
// 			// 	let rect = target.getBoundingClientRect();
// 			// 	let next = (ev.clientY - rect.top)/(rect.bottom - rect.top) > .5;
// 			// 	rootEl.insertBefore(dragEl, next && target.nextSibling || target);
// 			// }
// 		}
// 		return false;
// 	}
// 	function handleDragLeave(ev) {
// 		console.log("handleDragLeave", ev.target);
// 		ev.preventDefault();
// 		if (ev.stopPropagation) {
// 			ev.stopPropagation();
// 		}
// 		return false;
// 	}
// 	function handleDrop(ev) {
// 		console.log("handleDrop", ev.target);
// 		ev.preventDefault();
// 		if (ev.stopPropagation) {
// 			ev.stopPropagation();
// 		}
// 		return false;
// 	}
// 	function handleDragEnd(ev) {
// 		console.log("handleDragEnd", ev.target);
// 		ev.preventDefault();
// 		if (ev.stopPropagation) {
// 			ev.stopPropagation();
// 		}
// 		return false;
// 	}

// 	for (let engineElement of page.engines.getElementsByClassName("engine")) {
// 		let dragger = engineElement.getElementsByClassName("engine-dragger")[0];
// 		dragger.engineElement = engineElement;
// 		dragger.draggable = true;
// 		dragger.addEventListener('dragstart', handleDragStart, false);
// 		dragger.addEventListener('dragenter', handleDragEnter, false);
// 		dragger.addEventListener('dragover', handleDragOver, false);
// 		dragger.addEventListener('dragleave', handleDragLeave, false);
// 		dragger.addEventListener('drop', handleDrop, false);
// 		dragger.addEventListener('dragend', handleDragEnd, false);
// 	}

// 	return;

// 	// function _onDragOver(evt) {
// 	// 	evt.preventDefault();
// 	// 	evt.dataTransfer.dropEffect = 'move';

// 	// 	let target = evt.target;
// 	// 	console.log(target.nodeName);
// 	// 	if (target && target !== dragEl && target.nodeName == 'th') {
// 	// 		let rect = target.getBoundingClientRect();
// 	// 		let next = (evt.clientY - rect.top)/(rect.bottom - rect.top) > .5;
// 	// 		rootEl.insertBefore(dragEl, next && target.nextSibling || target);
// 	// 	}
// 	// }

// 	// function _onDragEnd(evt) {
// 	// 	evt.preventDefault();

// 	// 	dragEl.classList.remove('ghost');
// 	// 	rootEl.removeEventListener('dragover', _onDragOver, false);
// 	// 	rootEl.removeEventListener('dragend', _onDragEnd, false);

// 	// 	if (nextEl !== dragEl.nextSibling) {
// 	// 		onUpdate(dragEl);
// 	// 	}
// 	// }

// 	// rootEl.addEventListener('dragstart', function(evt) {
// 	// 	dragEl = evt.target;
// 	// 	nextEl = dragEl.nextSibling;
// 	// 	console.log(dragEl, nextEl);

// 	// 	evt.dataTransfer.effectAllowed = 'move';
// 	// 	evt.dataTransfer.setData('Text', dragEl.textContent);

// 	// 	rootEl.addEventListener('dragover', _onDragOver, false);
// 	// 	rootEl.addEventListener('dragend', _onDragEnd, false);

// 	// 	setTimeout(function() {
// 	// 		dragEl.classList.add('ghost');
// 	// 	}, 0)
// 	// }, false);
// }