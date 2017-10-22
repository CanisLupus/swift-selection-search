"use strict";

const mainScript = browser.extension.getBackgroundPage();
const DEBUG = mainScript.isDebugModeActive();
if (DEBUG) {
	var log = mainScript.log;
}

const page = {};
let hasPageLoaded = false;
let settings;

// Load settings. Either the last of both onSettingsAcquired and onPageLoaded will update the UI with the loaded settings.
browser.storage.local.get().then(onSettingsAcquired, mainScript.getErrorHandler("Error getting settings in settings page."));

document.addEventListener("DOMContentLoaded", onPageLoaded);

// This method's code was taken from node-lz4 by Pierre Curto. MIT license.
// CHANGES: Added ; to all lines. Reformated one-liners. Removed n = eIdx. Fixed eIdx skipping end bytes if sIdx != 0.
function decodeLz4Block(input, output, sIdx, eIdx)
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
		let output;
		let uncompressedSize = input.length*3;	// size estimate for uncompressed data!

		// Decode whole file.
		do {
			output = new Uint8Array(uncompressedSize);
			uncompressedSize = decodeLz4Block(input, output, 8+4);	// skip 8 byte magic number + 4 byte data size field
			// if there's more data than our output estimate, create a bigger output array and retry (at most one retry)
		} while (uncompressedSize > output.length);

		output = output.slice(0, uncompressedSize);	// remove excess bytes

		let decodedText = new TextDecoder().decode(output);
		onRead(decodedText);
	};

	if (onError) {
		reader.onerror = onError;
	}

	reader.readAsArrayBuffer(file);	// read as bytes
};

function updateBrowserEnginesFromSearchJson(browserSearchEngines)
{
	// separate all previous browser engines from the rest
	let wasPreviouslyEnabled = {};
	let nonBrowserEngines = [];

	for (let engine of settings.searchEngines)
	{
		if (engine.type === "browser") {
			wasPreviouslyEnabled[engine.id] = engine.isEnabled;
		} else {
			nonBrowserEngines.push(engine);
		}
	}

	settings.searchEngines = nonBrowserEngines;

	// add all current browser engines
	for (let engine of browserSearchEngines.engines)
	{
		if (engine._metaData.hidden) {
			continue;
		}

		let urlObj = engine._urls[0];
		let url = urlObj.template;

		if (urlObj.params.length > 0) {
			// template has params, so join them to get the full query URL
			url += "?" + urlObj.params
				.filter(p => p.value === "{searchTerms}")
				.map(p => p.name + "=" + p.value)
				.join("&");
		} else {
			// template has no params, so template is the full query URL
			url = url.replace("{searchTerms}", "[sss-searchTerms]");	// easy way to "save" {searchTerms} from regex replace...
			url = url.replace(/{(.*)}/g, "");
			url = url.replace("[sss-searchTerms]", "{searchTerms}");	// ...and add it back afterwards
		}

		let isEnabled = wasPreviouslyEnabled[engine._loadPath];
		isEnabled = isEnabled !== undefined ? isEnabled : true;	// if engine didn't exist, assume we want it enabled

		let sssBrowserEngine = {
			type: "browser",
			name: engine._name,
			iconSrc: engine._iconURL,
			searchUrl: url,
			isEnabled: isEnabled,
			id: engine._loadPath,	// used to identify engine in unique way
		};

		settings.searchEngines.push(sssBrowserEngine);
	}
}

function getDataUriFromImgUrl(url, callback)
{
	var img = new Image();
	img.crossOrigin = 'Anonymous';
	img.onload = function() {
		const maxSize = 48;
		let width;
		let height;
		let xPos = 0;
		let yPos = 0;

		// scale image to smaller icon if needed
		// (we don't want stored SSS icons to take a lot of space)
		if (this.width > this.height) {
			width = Math.min(maxSize, this.width);
			height = width * this.height / this.width;
			yPos = (width - height) / 2;
		} else if (this.height > this.width) {
			height = Math.min(maxSize, this.height);
			width = height * this.width / this.height;
			xPos = (height - width) / 2;
		} else {
			width = Math.min(maxSize, this.width);
			height = width;
		}

		if (DEBUG) { log(this.width + "x" + this.height); }
		if (DEBUG) { log(width + "x" + height); }

		// canvas is always a square (using larger dimension)
		let canvas = document.createElement('canvas');
		canvas.width = canvas.height = Math.max(width, height);

		// draw image with size and position defined above
		let ctx = canvas.getContext('2d');
		ctx.drawImage(this, xPos, yPos, width, height);

		let dataURL = canvas.toDataURL();
		if (DEBUG) { log(dataURL.length); }
		if (DEBUG) { log(url); }
		if (DEBUG) { log(dataURL); }
		callback(dataURL);
		canvas = null;
	};
	img.src = url;
}

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
	page.container.onchange = function(ev) {
		let item = ev.target;
		if (item.type === "color") {
			return;
		}
		if (DEBUG) { log("onFormChanged target: " + item.name + ", value: " + item.value); }

		if (item.name === "selectSearchEnginesFileButton") {
			let item = ev.target;
			let file = item.files[0];
			readMozlz4File(file, json => {
				if (DEBUG) { log(json); }
				let browserSearchEngines = JSON.parse(json);
				if (DEBUG) { log(browserSearchEngines); }
				updateBrowserEnginesFromSearchJson(browserSearchEngines);
				browser.storage.local.set({ searchEngines: settings.searchEngines });
				if (DEBUG) { log("saved!", settings); }
				updateUIWithSettings();
			});
		} else {
			if (item.name in settings) {
				let value;
				if (item.type === "checkbox") {
					value = item.checked;
				} else if (item.type === "number") {
					value = parseInt(item.value);
				} else {
					value = item.value;
				}
				settings[item.name] = value;
				browser.storage.local.set({ [item.name]: value });
				if (DEBUG) { log("saved!", settings); }
			}
		}
	};

	page.visibleSelectSearchEnginesFileButton.onclick = ev => page.selectSearchEnginesFileButton.click();

	// register events for specific behaviour when certain fields change
	page.popupBackgroundColorPicker.oninput = function(ev) { updateColorText  (page.popupBackgroundColor,       page.popupBackgroundColorPicker.value); };
	page.popupBackgroundColor.oninput       = function(ev) { updatePickerColor(page.popupBackgroundColorPicker, page.popupBackgroundColor.value);       };
	page.popupHighlightColorPicker.oninput  = function(ev) { updateColorText  (page.popupHighlightColor,        page.popupHighlightColorPicker.value);  };
	page.popupHighlightColor.oninput        = function(ev) { updatePickerColor(page.popupHighlightColorPicker,  page.popupHighlightColor.value);        };

	let defaultSettings = mainScript.getDefaultSettings();

	// register events for button clicks
	page.addEngineButton.onclick = function(ev) {
		let searchEngine = JSON.parse(JSON.stringify(defaultSettings.searchEngines[0]));
		settings.searchEngines.push(searchEngine);

		browser.storage.local.set({ searchEngines: settings.searchEngines });
		if (DEBUG) { log("saved!", settings); }
		updateUIWithSettings();
	};

	page.resetSettingsButton.onclick = function(ev) {
		ev.preventDefault();
		let searchEngines = settings.searchEngines;	// save engines
		settings = JSON.parse(JSON.stringify(defaultSettings));	// copy default settings
		settings.searchEngines = searchEngines;	// restore engines
		updateUIWithSettings();
		browser.storage.local.set(settings);
		if (DEBUG) { log("saved!", settings); }
	};

	page.resetSearchEnginesButton.onclick = function(ev) {
		ev.preventDefault();
		let defaultEngines = JSON.parse(JSON.stringify(defaultSettings.searchEngines));
		settings.searchEngines = defaultEngines;
		updateUIWithSettings();
		browser.storage.local.set({ searchEngines: settings.searchEngines });
		if (DEBUG) { log("saved!", settings); }
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
	if (DEBUG) { log("updateUIWithSettings", settings); }

	for (let item of page.inputs)
	{
		if (!(item.name in settings)) {
			continue;
		}

		if (item.type === "select-one") {
			item.value = settings[item.name];
		} else if (item.type !== "color" && item.type !== "button" && item.type !== "reset" && item.type !== "file") {
			if (item.type === "checkbox") {
				item.checked = settings[item.name];
			} else {
				item.value = settings[item.name];
			}
		}
	}

	updatePickerColor(page.popupBackgroundColorPicker, page.popupBackgroundColor.value);
	updatePickerColor(page.popupHighlightColorPicker, page.popupHighlightColor.value);

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
			onStart: function (/**Event*/evt) {
				if (DEBUG) { log("start drag", evt.oldIndex); }
			},
			onUpdate: function (evt/**Event*/){
				var item = evt.item; // the current dragged HTMLElement
				if (DEBUG) { log("onUpdate", item); }
			},
			onEnd: function (ev) {
				if (DEBUG) { log("onEnd", settings); }
				settings.searchEngines.splice(ev.newIndex, 0, settings.searchEngines.splice(ev.oldIndex, 1)[0]);
				browser.storage.local.set({ searchEngines: settings.searchEngines });
				if (DEBUG) { log("saved!", settings); }
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
		if (DEBUG) { log("saved!", settings); }
	};
	cell.appendChild(isEnabledInput);
	row.appendChild(cell);

	cell = document.createElement("td");
	cell.className = "engine-icon-img";
	let icon = document.createElement("img");
	if (engine.type === "sss") {
		icon.src = browser.extension.getURL(mainScript.getSssIcon(engine.id).iconPath);
	// NOTE: doesn't work! can't access resource:// links
	// } else if (engine.type === "browser" && engine.iconSrc.startsWith("resource://")) {
	// 	if (DEBUG) { log(engine.iconSrc); }
	// 	getDataUriFromImgUrl(engine.iconSrc, function(base64Img) {
	// 		icon.src = base64Img;
	// 		engine.iconSrc = base64Img;
	// 		browser.storage.local.set({ searchEngines: settings.searchEngines });
	// 		if (DEBUG) { log("saved!", settings); }
	// 	});
	} else if (!engine.iconSrc && engine.iconUrl) {
		getDataUriFromImgUrl(engine.iconUrl, function(base64Img) {
			icon.src = base64Img;
			engine.iconSrc = base64Img;
			browser.storage.local.set({ searchEngines: settings.searchEngines });
			if (DEBUG) { log("saved!", settings); }
		});
	} else {
		icon.src = engine.iconSrc;
	}
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
			if (DEBUG) { log("saved!", settings); }
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
			if (DEBUG) { log("saved!", settings); }
		};
		cell.appendChild(searchLinkInput);
		row.appendChild(cell);

		cell = document.createElement("td");
		cell.className = "engine-icon-link";
		let iconLinkInput = document.createElement("input");
		iconLinkInput.type = "text";
		iconLinkInput.value = engine.iconUrl;
		iconLinkInput.oninput = function(ev) {
			engine.iconUrl = iconLinkInput.value;
			icon.src = "";
			engine.iconSrc = "";
			getDataUriFromImgUrl(engine.iconUrl, function(base64Img) {
				icon.src = base64Img;
				engine.iconSrc = base64Img;
				browser.storage.local.set({ searchEngines: settings.searchEngines });
				if (DEBUG) { log("saved!", settings); }
			});
		};
		iconLinkInput.onchange = function(ev) {
			browser.storage.local.set({ searchEngines: settings.searchEngines });
			if (DEBUG) { log("saved!", settings); }
		};
		cell.appendChild(iconLinkInput);
		row.appendChild(cell);

		cell = document.createElement("td");
		cell.className = "engine-delete";
		let deleteButton = document.createElement("input");
		deleteButton.type = "button";
		deleteButton.value = "✖";
		deleteButton.onclick = function(ev) {
			settings.searchEngines.splice(i, 1);	// remove element at i
			browser.storage.local.set({ searchEngines: settings.searchEngines });
			if (DEBUG) { log("saved!", settings); }
			updateUIWithSettings();
		};
		cell.appendChild(deleteButton);
		row.appendChild(cell);
	}
	else if (engine.type === "browser")
	{
		cell = document.createElement("td");
		cell.className = "engine-native";
		cell.textContent = engine.name;
		row.appendChild(cell);

		cell = document.createElement("td");
		cell.className = "engine-native";
		cell.colSpan = 2;
		cell.textContent = engine.searchUrl;
		row.appendChild(cell);
	}
	else if (engine.type === "sss")
	{
		let sssIcon = mainScript.getSssIcon(engine.id);

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
		if (DEBUG) { log("saved!", settings); }
	}
}

function updatePickerColor(picker, value)
{
	value = value.substring(0, 7);

	if (picker.value !== value) {
		picker.value = value;
	}
}
