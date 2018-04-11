"use strict";

const mainScript = browser.extension.getBackgroundPage();
const DEBUG = mainScript.isDebugModeActive();
if (DEBUG) {
	var log = mainScript.log;
}

// Subset of consts present in background script (avoids having to ask for them).
const consts = {
	PopupOpenBehaviour_MiddleMouse: "middle-mouse",
};

const page = {};
let settings;
let hasPageLoaded = false;
let isFocused = true;
let pendingSettings = false;
let isSeparateTab = location.search.includes("open_in_tab=true");

// Load settings. Either the last of both onSettingsAcquired and onPageLoaded will update the UI with the loaded settings.
browser.storage.local.get().then(onSettingsAcquired, mainScript.getErrorHandler("Error getting settings in settings page."));
browser.storage.onChanged.addListener(onSettingsChanged);

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
	let searchUrls = {};
	for (let engine of settings.searchEngines) {
		if (engine.type === "browser") {
			searchUrls[engine.searchUrl] = true;
		}
	}

	// add all current browser engines
	for (let engine of browserSearchEngines.engines)
	{
		if (engine._metaData.hidden) {
			continue;
		}

		for (let urlObj of engine._urls)
		{
			if (urlObj.type !== undefined && urlObj.type !== "text/html") {
				continue;
			}

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

			if (searchUrls.hasOwnProperty(url)) {
				continue;
			}

			let sssBrowserEngine = {
				type: "browser",
				name: engine._name,
				iconUrl: engine._iconURL,
				searchUrl: url,
				isEnabled: true,
			};

			settings.searchEngines.push(sssBrowserEngine);
		}
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

		if (DEBUG) { log(this.width + "x" + this.height + " became " + width + "x" + height); }

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
	page.container.onchange = (ev) => {
		let item = ev.target;
		if (item.type === "color") {
			return;
		}
		if (DEBUG) { log("onFormChanged target: " + item.name + ", value: " + item.value); }

		if (item.name === "importBrowserEnginesFileButton_real") {
			readMozlz4File(ev.target.files[0], json => {
				let browserSearchEngines = JSON.parse(json);
				if (DEBUG) { log(browserSearchEngines); }
				updateBrowserEnginesFromSearchJson(browserSearchEngines);
				updateUIWithSettings();
				saveSettings({ searchEngines: settings.searchEngines });
				// alert("Your browser's search engines were imported!");
			});
		} else if (item.name === "importSettingsFromFileButton_real") {
			let reader = new FileReader();
			reader.onload = function() {
				let importedSettings = JSON.parse(reader.result);
				importSettings(importedSettings);
				// alert("All settings were imported!");
			};
			reader.readAsText(ev.target.files[0]);
		} else if (item.name in settings) {
			if (item.name === "popupOpenBehaviour") {
				updateMiddleMouseSelectionClickMarginSetting(item.value);
			}

			let value;
			if (item.type === "checkbox") {
				value = item.checked;
			} else if (item.type === "number") {
				value = parseInt(item.value);
			} else {
				value = item.value;
			}
			settings[item.name] = value;
			saveSettings({ [item.name]: value });
		}
	};

	page.importBrowserEnginesFileButton.onclick = ev => page.importBrowserEnginesFileButton_real.click();
	page.exportSettingsToFileButton.onclick = ev => {
		var blob = runActionOnDietSettings(settings, (settings) => new Blob([JSON.stringify(settings)]));
		let filename = "SSS settings backup (" + new Date(Date.now()).toJSON().replace(/:/g, ".") + ").json";
		browser.downloads.download({
			"saveAs": true,
			"url": URL.createObjectURL(blob),
			"filename": filename,
		});
	};
	page.importSettingsFromFileButton.onclick = ev => page.importSettingsFromFileButton_real.click();

	// register events for specific behaviour when certain fields change
	page.popupBackgroundColorPicker.oninput = (ev) => updateColorText  (page.popupBackgroundColor,       page.popupBackgroundColorPicker.value);
	page.popupBackgroundColor.oninput       = (ev) => updatePickerColor(page.popupBackgroundColorPicker, page.popupBackgroundColor.value);
	page.popupHighlightColorPicker.oninput  = (ev) => updateColorText  (page.popupHighlightColor,        page.popupHighlightColorPicker.value);
	page.popupHighlightColor.oninput        = (ev) => updatePickerColor(page.popupHighlightColorPicker,  page.popupHighlightColor.value);

	// sections' collapse/expand code

	let sectionNameElements = document.getElementsByClassName("section-name");

	for (let sectionNameElement of sectionNameElements)
	{
		sectionNameElement.onclick = () => {
			if (settings.sectionsExpansionState === undefined) {
				settings.sectionsExpansionState = {};
			}
			let isCollapsed = sectionNameElement.parentElement.classList.toggle("collapsed-section");
			settings.sectionsExpansionState[sectionNameElement.parentElement.id] = !isCollapsed;
			saveSettings({ sectionsExpansionState: settings.sectionsExpansionState });
		}
	}

	let defaultSettings = mainScript.getDefaultSettings();

	// general layout (changes if page is embedded or separate)

	if (!isSeparateTab) {
		document.body.className = "embedded";
	}

	window.onfocus = (ev) => {
		// if settings changed while page was not focused, reload settings and UI
		if (pendingSettings) {
			browser.storage.local.get().then(onSettingsAcquired, mainScript.getErrorHandler("Error getting settings in settings page."));
		}
		isFocused = true;
	};

	window.onblur = (ev) => {
		isFocused = false;
	};

	// engines footnote

	let enginesFootnoteElem = document.getElementById("engines-footnote");

	function addToFootnote(text, linkParams)
	{
		enginesFootnoteElem.appendChild(document.createTextNode(text));

		for (let i = 0; i < linkParams.length; ) {
			let link = linkParams[i++];
			let linkText = linkParams[i++];
			let postText = linkParams[i++];
			let anchor = document.createElement("a");
			anchor.href = link;
			anchor.textContent = linkText;
			anchor.target = "_blank";
			enginesFootnoteElem.appendChild(anchor);
			enginesFootnoteElem.appendChild(document.createTextNode(postText));
		}
	}

	if (!isDragSupported()) {
		addToFootnote("* My apologies for using ↑/↓ buttons to reorder the engines. Dragging is much better but it doesn't work in this page due to a ",
			["https://bugzilla.mozilla.org/show_bug.cgi?id=1408756", "Firefox bug", ". It should work on a separate tab, however, so I've enabled it for ",
			"/settings/settings.html?open_in_tab=true", "this link", " if you wish to try!"]);

		if (mainScript.getBrowserVersion() < 58) {
			addToFootnote(" If you click a dropdown and it appears far from where it should, that is also a ",
				["https://bugzilla.mozilla.org/show_bug.cgi?id=1390445", "Firefox bug", " (fixed in Firefox 58)."]);
		}
	}

	// register events for button clicks

	page.addEngineButton.onclick = (ev) => {
		let searchEngine = JSON.parse(JSON.stringify(defaultSettings.searchEngines[3]));	// first two are special sss icons
		settings.searchEngines.push(searchEngine);

		saveSettings({ searchEngines: settings.searchEngines });
		updateUIWithSettings();
	};

	page.addSeparatorButton.onclick = (ev) => {
		settings.searchEngines.push({
					type: "sss",
					id: "separator",
					isEnabled: true,
				});

		saveSettings({ searchEngines: settings.searchEngines });
		updateUIWithSettings();
	};

	page.saveSettingsToSyncButton.onclick = (ev) => {
		if (DEBUG) { log("saving!"); }
		let settingsStr = runActionOnDietSettings(settings, (settings) => JSON.stringify(settings));

		// divide into different fields so as not to trigger Firefox's "Maximum bytes per object exceeded ([number of bytes] > 16384 Bytes.)"
		let chunks = {};
		let chunkIndex = 0;
		for (let i = 0, length = settingsStr.length; i < length; i += 1000, chunkIndex++) {
			chunks["p"+chunkIndex] = settingsStr.substring(i, i + 1000);
		}

		browser.storage.sync.set(chunks).then(
			() => { if (DEBUG) { log("All settings and engines were saved in Sync!"); } },
			() => { if (DEBUG) { log("Uploading to Sync failed! Is your network working? Are you under the 100KB size limit?"); } }
		);
		if (DEBUG) { log("saved in sync!", chunks); }
	};

	// confirmation buttons

	function setupConfirmationProcessForButton(mainButton, confirmationButton, originalMainButtonValue, onConfirm)
	{
		mainButton.onclick = (ev) => {
			if (mainButton.value === "Cancel") {
				mainButton.value = originalMainButtonValue;
				confirmationButton.style.display = "none";
			} else {
				mainButton.value = "Cancel";
				confirmationButton.style.display = "";
			}
		};

		confirmationButton.onclick = (ev) => {
			mainButton.value = originalMainButtonValue;
			confirmationButton.style.display = "none";

			ev.preventDefault();
			onConfirm();
		};
	}

	setupConfirmationProcessForButton(page.resetSearchEnginesButton, page.resetSearchEnginesButton_real, page.resetSearchEnginesButton.value,
		() => {
			let defaultEngines = JSON.parse(JSON.stringify(defaultSettings.searchEngines));
			settings.searchEngines = defaultEngines;
			updateUIWithSettings();
			saveSettings({ searchEngines: settings.searchEngines });
		}
	);

	setupConfirmationProcessForButton(page.resetSettingsButton, page.resetSettingsButton_real, page.resetSettingsButton.value,
		() => {
			let searchEngines = settings.searchEngines;	// save engines
			settings = JSON.parse(JSON.stringify(defaultSettings));	// copy default settings
			settings.searchEngines = searchEngines;	// restore engines
			updateUIWithSettings();
			saveSettings(settings);
		}
	);

	setupConfirmationProcessForButton(page.loadSettingsFromSyncButton, page.loadSettingsFromSyncButton_real, page.loadSettingsFromSyncButton.value,
		() => browser.storage.sync.get().then((chunks) => {
			if (DEBUG) { log(chunks); }
			let chunksList = [];
			let p;
			for (let i = 0; (p = chunks["p"+i]) !== undefined; i++) {
				chunksList.push(p);
			}
			let settingsStr = chunksList.join("");
			importSettings(JSON.parse(settingsStr));
		}, mainScript.getErrorHandler("Error getting settings from sync.")));

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

function onSettingsChanged()
{
	if (!isFocused) {
		pendingSettings = true;
	}
}

function updateUIWithSettings()
{
	if (DEBUG) { log("updateUIWithSettings", settings); }

	// load UI values from settings

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

	updateMiddleMouseSelectionClickMarginSetting(settings.popupOpenBehaviour);

	// calculate storage size

	calculateAndShowSettingsSize();

	// update engines

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

		let useDrag = isDragSupported();

		for (let column of document.getElementsByClassName("variable-colspan")) {
			column.colSpan = useDrag ? 3 : 4;
		}

		if (useDrag)
		{
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
					updateUIWithSettings();
					saveSettings({ searchEngines: settings.searchEngines });
				},
			});
		}
	}

	// collapse or expand sections

	if (settings.sectionsExpansionState !== undefined)
	{
		for (let sectionId of Object.keys(settings.sectionsExpansionState))
		{
			let classList = document.getElementById(sectionId).classList;
			let isExpanded = settings.sectionsExpansionState[sectionId];
			classList.toggle("collapsed-section", !isExpanded);
		}
	}
}

function isDragSupported()
{
	// check if we are on a version where drag is supported in the settings page
	let browserVersion = mainScript.getBrowserVersion()
	if (browserVersion <= 55) {
		return true;
	}
	// otherwise check if we are on a separate tab and use drag anyway if that's the case
	return isSeparateTab;
}

function calculateAndShowSettingsSize()
{
	if (true) return;	// we don't care about this code until Sync is bug-free

	// let storageSize = runActionOnDietSettings(settings, (settings) => roughSizeOfObject(settings));
	let storageSize = runActionOnDietSettings(settings, (settings) => JSON.stringify(settings).length * 2);
	if (storageSize > 100 * 1024) {
		for (let elem of document.getElementsByClassName("warn-when-over-storage-limit")) {
			elem.style.color = "red";
		}
	} else {
		for (let elem of document.getElementsByClassName("warn-when-over-storage-limit")) {
			elem.style.color = "";
		}
	}
	let storageSizeElement = document.getElementById("storage-size");
	storageSizeElement.textContent = getSizeWithUnit(storageSize);
}

function addSearchEngine(engine, i)
{
	let row = document.createElement("tr");
	row.className = "engine";

	let cell;

	// dragger element

	if (isDragSupported())
	{
		cell = document.createElement("td");
		cell.className = "engine-dragger";
		let div = document.createElement("div");
		div.textContent = "☰";
		div.style.cursor = "move";
		cell.appendChild(div);
		row.appendChild(cell);
	}
	else
	{
		// move up button

		cell = document.createElement("td");
		cell.className = "engine-move-up";
		let moveUpButton = document.createElement("input");
		moveUpButton.type = "button";
		moveUpButton.value = "↑";
		if (i > 0) {
			moveUpButton.onclick = (ev) => {
				if (i <= 0) {
					return;
				}
				let tmp = settings.searchEngines[i];
				settings.searchEngines[i] = settings.searchEngines[i-1];
				settings.searchEngines[i-1] = tmp;
				updateUIWithSettings();
				saveSettings({ searchEngines: settings.searchEngines });
			};
		} else {
			moveUpButton.style.opacity = 0.5;
		}
		cell.appendChild(moveUpButton);
		row.appendChild(cell);

		// move down button

		cell = document.createElement("td");
		cell.className = "engine-move-down";
		let moveDownButton = document.createElement("input");
		moveDownButton.type = "button";
		moveDownButton.value = "↓";
		if (i < settings.searchEngines.length-1) {
			moveDownButton.onclick = (ev) => {
				if (i >= settings.searchEngines.length-1) {
					return;
				}
				let tmp = settings.searchEngines[i];
				settings.searchEngines[i] = settings.searchEngines[i+1];
				settings.searchEngines[i+1] = tmp;
				updateUIWithSettings();
				saveSettings({ searchEngines: settings.searchEngines });
			};
		} else {
			moveDownButton.style.opacity = 0.5;
		}
		cell.appendChild(moveDownButton);
		row.appendChild(cell);
	}

	// "is enabled" checkbox

	cell = document.createElement("td");
	cell.className = "engine-is-enabled";
	let isEnabledInput = document.createElement("input");
	isEnabledInput.type = "checkbox";
	isEnabledInput.checked = engine.isEnabled;
	isEnabledInput.autocomplete = "off";
	isEnabledInput.onchange = (ev) => {
		engine.isEnabled = isEnabledInput.checked;
		saveSettings({ searchEngines: settings.searchEngines });
	};
	cell.style.paddingLeft = "6px";	// remove this when drag works again in add-on pages
	cell.appendChild(isEnabledInput);
	row.appendChild(cell);

	// icon

	cell = document.createElement("td");
	cell.className = "engine-icon-img";
	let icon = document.createElement("img");

	if (engine.type === "sss") {
		icon.src = browser.extension.getURL(mainScript.getSssIcon(engine.id).iconPath);
	} else if (engine.iconUrl.startsWith("data:")) {
		icon.src = engine.iconUrl;
	} else if (settings.searchEnginesCache[engine.iconUrl] === undefined && engine.iconUrl) {
		icon.src = engine.iconUrl;
		getDataUriFromImgUrl(engine.iconUrl, function(base64Img) {
			icon.src = base64Img;
			settings.searchEnginesCache[engine.iconUrl] = base64Img;
			saveSettings({ searchEnginesCache: settings.searchEnginesCache });
		});
	} else {
		icon.src = settings.searchEnginesCache[engine.iconUrl];
	}
	cell.appendChild(icon);
	row.appendChild(cell);

	if (engine.type === "sss")
	{
		let sssIcon = mainScript.getSssIcon(engine.id);

		// name

		cell = document.createElement("td");
		cell.className = "engine-native";
		cell.textContent = sssIcon.name;
		row.appendChild(cell);

		// description

		cell = document.createElement("td");
		cell.className = "engine-native";
		cell.colSpan = 2;
		cell.textContent = sssIcon.description;
		row.appendChild(cell);
	}
	else
	{
		// name

		cell = document.createElement("td");
		cell.className = "engine-name";
		let nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.value = engine.name;
		nameInput.onchange = (ev) => {
			engine.name = nameInput.value;
			saveSettings({ searchEngines: settings.searchEngines });
			calculateAndShowSettingsSize();
		};
		cell.appendChild(nameInput);
		row.appendChild(cell);

		// search link

		cell = document.createElement("td");
		cell.className = "engine-search-link";
		let searchLinkInput = document.createElement("input");
		searchLinkInput.type = "text";
		searchLinkInput.value = engine.searchUrl;
		searchLinkInput.onchange = (ev) => {
			engine.searchUrl = searchLinkInput.value;
			saveSettings({ searchEngines: settings.searchEngines });
			calculateAndShowSettingsSize();
		};
		cell.appendChild(searchLinkInput);
		row.appendChild(cell);

		// icon link

		cell = document.createElement("td");
		cell.className = "engine-icon-link";
		let iconLinkInput = document.createElement("input");
		iconLinkInput.type = "text";
		iconLinkInput.value = engine.iconUrl;

		iconLinkInput.oninput = (ev) => {
			engine.iconUrl = iconLinkInput.value.trim();
			icon.src = engine.iconUrl;

			if (!engine.iconUrl.startsWith("data:")) {
				getDataUriFromImgUrl(engine.iconUrl, function(base64Img) {
					icon.src = base64Img;
					settings.searchEnginesCache[engine.iconUrl] = base64Img;
				});
			}
		};

		iconLinkInput.onchange = (ev) => {
			trimSearchEnginesCache(settings);
			saveSettings({ searchEngines: settings.searchEngines, searchEnginesCache: settings.searchEnginesCache });
			calculateAndShowSettingsSize();
		};
		cell.appendChild(iconLinkInput);
		row.appendChild(cell);

		// delete button

		cell = document.createElement("td");
		cell.className = "engine-delete";
		let deleteButton = document.createElement("input");
		deleteButton.type = "button";
		deleteButton.value = "✖";
		deleteButton.onclick = (ev) => {
			settings.searchEngines.splice(i, 1);	// remove element at i
			trimSearchEnginesCache(settings);
			updateUIWithSettings();
			saveSettings({ searchEngines: settings.searchEngines, searchEnginesCache: settings.searchEnginesCache });
		};
		cell.appendChild(deleteButton);
		row.appendChild(cell);
	}

	page.engines.appendChild(row);
}

function trimSearchEnginesCache(settings)
{
	let newCache = {};

	for (let engine of settings.searchEngines)
	{
		if (!engine.iconUrl || engine.iconUrl.startsWith("data:")) {
			continue;
		}

		let cachedIcon = settings.searchEnginesCache[engine.iconUrl];
		if (cachedIcon) {
			newCache[engine.iconUrl] = cachedIcon;
		}
	}

	settings.searchEnginesCache = newCache;
}

// removes from settings any objects that are easily re-calculatable (ex.: caches)
// in order to reduce size for an action, and then places them back and returns the action's result
function runActionOnDietSettings(settings, onCleaned)
{
	let cache = settings.searchEnginesCache;
	delete settings.searchEnginesCache;
	let result = onCleaned(settings);
	settings.searchEnginesCache = cache;
	return result;
}

function importSettings(importedSettings)
{
	if (importedSettings.searchEngines === undefined) {
		if (DEBUG) { log("imported settings are empty!", importedSettings); }
		return;
	}

	settings = importedSettings;
	settings.searchEnginesCache = {};

	mainScript.runBackwardsCompatibilityUpdates(settings);

	if (DEBUG) { log("imported settings!", settings); }

	updateUIWithSettings();
	saveSettings(settings);
}

function updateColorText(text, value)
{
	value = value.toUpperCase();

	if (text.value !== value) {
		text.value = value;
		saveSettings({ [text.name]: value });
	}
}

function updatePickerColor(picker, value)
{
	value = value.substring(0, 7);

	if (picker.value !== value) {
		picker.value = value;
	}
}

function updateMiddleMouseSelectionClickMarginSetting(popupOpenBehaviour)
{
	let middleMouseSelectionClickMarginSetting = page["middleMouseSelectionClickMargin"].closest(".setting");
	if (popupOpenBehaviour === consts.PopupOpenBehaviour_MiddleMouse) {
		middleMouseSelectionClickMarginSetting.classList.remove("hidden");
	} else {
		middleMouseSelectionClickMarginSetting.classList.add("hidden");
	}
}

// taken from https://stackoverflow.com/a/11900218/2162837
// by thomas-peter
// License: https://creativecommons.org/licenses/by-sa/3.0/legalcode
// Changes: formatting
function roughSizeOfObject(object)
{
	var objectList = [];
	var stack = [object];
	var bytes = 0;

	while (stack.length)
	{
		var value = stack.pop();

		if (typeof value === 'boolean') {
			bytes += 4;
		}
		else if (typeof value === 'string') {
			bytes += value.length * 2;
		}
		else if (typeof value === 'number') {
			bytes += 8;
		}
		else if (typeof value === 'object' && objectList.indexOf(value) === -1) {
			objectList.push(value);

			for (var i in value) {
				stack.push(value[i]);
			}
		}
	}
	return bytes;
}

function getSizeWithUnit(size)
{
	let unit = 0;
	while (size >= 1024 && unit <= 2) {
		size /= 1024;
		unit++;
	}

	size = Math.round(size);

	if (unit == 0) {
		return size + "B";
	} else if (unit == 1) {
		return size + "KB";
	} else if (unit == 2) {
		return size + "MB";
	} else {
		return size + "GB";
	}
}

function saveSettings(obj)
{
	browser.storage.local.set(obj);
	if (DEBUG) { log("saved!", settings); }
}
