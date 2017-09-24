"use strict";

let page = {};
let mainScript = browser.extension.getBackgroundPage();
let hasPageLoaded = false;
let settings;

// Load settings. Either the last of both onSettingsAcquired and onPageLoaded will update the UI with the loaded settings.
browser.storage.local.get().then(onSettingsAcquired, mainScript.getErrorHandler("Error getting settings in settings page."));

document.addEventListener("DOMContentLoaded", onPageLoaded);

// This method was taken from node-lz4 by Pierre Curto. MIT license.
// CHANGES: Added ; to all lines. Reformated one-liners. Removed n = eIdx. Fixed eIdx skipping end bytes if sIdx != 0.
function decodeBlock(input, output, sIdx, eIdx)
{
	sIdx = sIdx || 0;
	eIdx = eIdx || input.length;

	// Process each sequence in the incoming data
	for (var i = sIdx, j = 0; i < eIdx;)
	{
		var token = input[i++];

		// Literals
		var literals_length = (token >> 4);
		if (literals_length > 0) {
			// length of literals
			var l = literals_length + 240;
			while (l === 255) {
				l = input[i++];
				literals_length += l;
			}

			// Copy the literals
			var end = i + literals_length;
			while (i < end) {
				output[j++] = input[i++];
			}

			// End of buffer?
			if (i === eIdx) {
				return j;
			}
		}

		// Match copy
		// 2 bytes offset (little endian)
		var offset = input[i++] | (input[i++] << 8);

		// 0 is an invalid offset value
		if (offset === 0 || offset > j) {
			return -(i-2);
		}

		// length of match copy
		var match_length = (token & 0xf);
		var l = match_length + 240;
		while (l === 255) {
			l = input[i++];
			match_length += l;
		}

		// Copy the match
		var pos = j - offset; // position of the match copy in the current output
		var end = j + match_length + 4; // minmatch = 4
		while (j < end) {
			output[j++] = output[pos++];
		}
	}

	return j;
}

function readMozlz4File(file, onRead, onError)
{
	let reader = new FileReader();

	reader.onload = function() {
		let input = new Uint8Array(reader.result);
		let output = new Uint8Array(input.length*3);	// size estimate for uncompressed data!

		let uncompressedSize = decodeBlock(input, output, 8+4);	// skip 8 byte magic number + 4 byte data size field
		// if we there's more data than our estimate, create a bigger output array and retry
		if (uncompressedSize > output.length) {
			output = new Uint8Array(uncompressedSize);
			decodeBlock(input, output, 8+4);
		}
		output = output.slice(0, uncompressedSize);	// remove excess bytes

		let decodedText = new TextDecoder().decode(output);
		onRead(decodedText);
	};

	if (onError) {
		reader.onerror = onError;
	}

	reader.readAsArrayBuffer(file);
};

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
			if (item.name === "selectSearchEnginesFileButton") {
				let item = ev.target;
				let file = item.files[0];
				readMozlz4File(file, json => {
					console.log(json);
					let browserSearchEngines = JSON.parse(json);
					console.log(browserSearchEngines);
				});
			} else {
				browser.storage.local.set({ [item.name]: item.value });
			}
		}
	};

	page.visibleSelectSearchEnginesFileButton.onclick = ev => page.selectSearchEnginesFileButton.click();

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
	// console.log("updateUIWithSettings", settings);

	for (let item of page.inputs)
	{
		if (item.type === "select-one") {
			if (item.name in settings) {
				item.value = parseInt(settings[item.name]);
			}
		}
		else if (item.type !== "color" && item.type !== "button" && item.type !== "reset" && item.type !== "file") {
			if (item.name in settings) {
				if (item.type === "checkbox") {
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