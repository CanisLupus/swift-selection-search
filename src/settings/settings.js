"use strict";

const page = {};
let settings;
let hasPageLoaded = false;
let isFocused = true;
let pendingSettings = false;

let DEBUG;
let consts;
let defaultSettings;
let browserVersion;
let log;
let hasDOMContentLoaded = false;

document.addEventListener("DOMContentLoaded", onDOMContentLoaded);

// ask all needed information from the background script (can't use browser.extension.getBackgroundPage() in private mode, so it has to be this way)

browser.runtime.sendMessage({ type: "getDataForSettingsPage" }).then(
	data => {
		DEBUG = data.DEBUG;
		browserVersion = data.browserVersion;
		consts = data.consts;
		defaultSettings = data.defaultSettings;

		// now we can initialize things

		if (DEBUG) {
			log = console.log;
		}

		// Load settings. The last of either onSettingsAcquired and onPageLoaded will update the UI with the loaded settings.
		browser.storage.local.get().then(onSettingsAcquired, getErrorHandler("Error getting settings in settings page."));
		browser.storage.onChanged.addListener(onSettingsChanged);

		// if DOM already loaded by now, setup page
		if (hasDOMContentLoaded) {
			onPageLoaded();
		}
		// if it isn't, set up page when DOM loads (onDOMContentLoaded)
	},
	getErrorHandler("Error sending getDataForSettingsPage message from settings.")
);

// default error handler for promises
function getErrorHandler(text)
{
	if (DEBUG) {
		return error => { log(`${text} (${error})`); };
	} else {
		return undefined;
	}
}

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

// reads a .mozlz4 compressed file and returns its bytes
function readMozlz4File(file, onRead, onError)
{
	let reader = new FileReader();

	// prepare onload function before actually trying to read the file
	reader.onload = () => {
		let input = new Uint8Array(reader.result);
		let output;
		let uncompressedSize = input.length*3;	// size _estimate_ for uncompressed data!

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

// adds to SSS all engines from the browser's search engines file
function updateBrowserEnginesFromSearchJson(browserSearchEngines)
{
	// "hash set" of search URLs (will help avoiding duplicates of previously imported browser engines)
	let searchUrls = {};
	for (let engine of settings.searchEngines) {
		if (engine.type === "browser") {
			searchUrls[engine.searchUrl] = true;
		}
	}

	// add all given search engines
	for (let engine of browserSearchEngines.engines)
	{
		// don't add hidden engines
		if (engine._metaData.hidden) {
			continue;
		}

		// browser engines can have several URLs, but we want only certain kinds
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
				url = url.replace("{searchTerms}", "[sss-searchTerms]");	// easy way to "protect" {searchTerms} from regex replace...
				url = url.replace(/{(.*)}/g, "");
				url = url.replace("[sss-searchTerms]", "{searchTerms}");	// ...and add it back afterwards
			}

			// avoid duplicates if this URL is already in the "hash set"
			if (searchUrls.hasOwnProperty(url)) {
				continue;
			}

			// finally add the engine to the user's engines

			let sssBrowserEngine = {
				type: "browser",
				name: engine._name,
				iconUrl: engine._iconURL,
				searchUrl: url,
				isEnabled: true,
				isEnabledInContextMenu: true,
			};

			settings.searchEngines.push(sssBrowserEngine);
		}
	}
}

// Hackish way to get the image data (base64 data:image) from the URL of an image.
// Sets the URL as img source, waits for download, then scales it down if needed, draws to a canvas and gets the resulting pixel data.
function getDataUriFromImgUrl(imageUrl, callback)
{
	var img = new Image();
	img.crossOrigin = 'Anonymous';
	img.onload = () => {
		const maxSize = 48;
		let width;
		let height;
		let xPos = 0;
		let yPos = 0;

		// Scale image to smaller icon if needed (always keep aspect ratio).
		// We don't want stored SSS icons to take a lot of space.
		if (img.width > img.height) {
			width = Math.min(maxSize, img.width);
			height = width * img.height / img.width;
			yPos = (width - height) / 2;
		} else if (img.height > img.width) {
			height = Math.min(maxSize, img.height);
			width = height * img.width / img.height;
			xPos = (height - width) / 2;
		} else {
			width = Math.min(maxSize, img.width);
			height = width;
		}

		if (DEBUG) { log(img.width + "x" + img.height + " became " + width + "x" + height); }

		// canvas is always a square (using larger dimension)
		let canvas = document.createElement('canvas');
		canvas.width = canvas.height = Math.max(width, height);

		// draw image with size and position defined above
		let ctx = canvas.getContext('2d');
		ctx.drawImage(img, xPos, yPos, width, height);

		// finally get the image data (base64 data:image)
		let dataURL = canvas.toDataURL();
		if (DEBUG) { log(dataURL.length); }
		if (DEBUG) { log(imageUrl); }
		if (DEBUG) { log(dataURL); }
		callback(dataURL);
		canvas = null;
	};

	img.src = imageUrl;	// starts the download and will call onload eventually
}

function onDOMContentLoaded()
{
	// if we have the consts already, it means we have everything from the background script
	if (consts !== undefined) {
		onPageLoaded();
	}
	hasDOMContentLoaded = true;
}

// main setup for settings page, called when page loads
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

	page.container.onchange = ev => {
		let item = ev.target;
		// skip changes to color fields, since we have hexadecimal text fields for them, and they also change
		if (item.type === "color") {
			return;
		}

		if (DEBUG) { log("onFormChanged target: " + item.name + ", value: " + item.value); }

		// special things in the options page need special code

		if (item.name === "importBrowserEnginesFileButton_real")
		{
			readMozlz4File(ev.target.files[0], json => {
				let browserSearchEngines = JSON.parse(json);
				if (DEBUG) { log(browserSearchEngines); }
				updateBrowserEnginesFromSearchJson(browserSearchEngines);
				updateUIWithSettings();
				saveSettings({ searchEngines: settings.searchEngines });
				// alert("Your browser's search engines were imported!");
			});
		}
		else if (item.name === "importSettingsFromFileButton_real")
		{
			let reader = new FileReader();
			reader.onload = () => {
				let importedSettings = JSON.parse(reader.result);
				importSettings(importedSettings);
				// alert("All settings were imported!");
			};
			reader.readAsText(ev.target.files[0]);
		}
		// otherwise, if not a "special thing", this is a field
		else if (item.name in settings)
		{
			// certain fields cause other fields to show/hide when changed, so check those
			if (item.name === "popupOpenBehaviour") {
				updateSetting_middleMouseSelectionClickMargin(item.value);
			} else if (item.name === "useSingleRow") {
				updateSetting_nPopupIconsPerRow(item.checked);
				updateSetting_iconAlignmentInGrid(item.checked);
			}

			// different fields have different ways to get their value
			let value;
			if (item.type === "checkbox") {
				value = item.checked;
			} else if (item.type === "number") {
				value = parseInt(item.value);
			} else {
				value = item.value;
			}

			// register the change and save in storage
			settings[item.name] = value;
			saveSettings({ [item.name]: value });
		}
	};

	// there are two elements for some buttons: a button for display and the actual "real" button that does the work
	page.importBrowserEnginesFileButton.onclick = ev => page.importBrowserEnginesFileButton_real.click();
	page.exportSettingsToFileButton.onclick = ev => {
		// remove useless stuff that doesn't need to be stored
		var blob = runActionOnDietSettings(settings, settings => new Blob([JSON.stringify(settings)]));
		// save with current date and time
		let filename = "SSS settings backup (" + new Date(Date.now()).toJSON().replace(/:/g, ".") + ").json";

		browser.downloads.download({	// NOTE: to save as a file we need the "downloads permission"
			"saveAs": true,
			"url": URL.createObjectURL(blob),
			"filename": filename,
		});
	};
	page.importSettingsFromFileButton.onclick = ev => page.importSettingsFromFileButton_real.click();

	// register events for specific behaviour when certain fields change (color pickers change their text and vice versa)
	page.popupBackgroundColorPicker.oninput = ev => updateColorText  (page.popupBackgroundColor,       page.popupBackgroundColorPicker.value);
	page.popupBackgroundColor.oninput       = ev => updatePickerColor(page.popupBackgroundColorPicker, page.popupBackgroundColor.value);
	page.popupHighlightColorPicker.oninput  = ev => updateColorText  (page.popupHighlightColor,        page.popupHighlightColorPicker.value);
	page.popupHighlightColor.oninput        = ev => updatePickerColor(page.popupHighlightColorPicker,  page.popupHighlightColor.value);

	// sections' collapse/expand code

	let sectionNameElements = document.getElementsByClassName("section-name");

	for (let sectionNameElement of sectionNameElements)
	{
		// toggle entire section on clicking the title, and save in settings the resulting state (open/closed)
		sectionNameElement.onclick = () => {
			if (settings.sectionsExpansionState === undefined) {
				settings.sectionsExpansionState = {};
			}
			let isCollapsed = sectionNameElement.parentElement.classList.toggle("collapsed-section");
			settings.sectionsExpansionState[sectionNameElement.parentElement.id] = !isCollapsed;
			saveSettings({ sectionsExpansionState: settings.sectionsExpansionState });
		}
	}

	// show platform-specific sections (some info on the page is related to a specific OS and should only appear in that OS)

	browser.runtime.getPlatformInfo().then(info => {
		let platformSpecificElements;

		switch (info.os)
		{
			case "android":
			case "cros":
			case "linux":
			case "openbsd":
				platformSpecificElements = document.getElementsByClassName("os-linux");
				break;
			case "mac":
				platformSpecificElements = document.getElementsByClassName("os-mac");
				break;
			case "win":
			default:
				platformSpecificElements = document.getElementsByClassName("os-windows");
				break;
		}

		for (let elem of platformSpecificElements) {
			elem.style.display = "inline";
		}
	});

	// show/hide Firefox version-specific sections

	if (browserVersion < 60)
	{
		for (let elem of document.getElementsByClassName("command")) {
			elem.classList.add("disabled", true);
		}

		for (let elem of document.getElementsByClassName("pre-ff-60")) {
			elem.style.display = "initial";
		}

		for (let elem of document.getElementsByClassName("post-ff-60")) {
			elem.style.display = "none";
		}
	}

	// entering/leaving settings page

	window.onfocus = ev => {
		// if settings changed while page was not focused, reload settings and UI
		if (pendingSettings) {
			browser.storage.local.get().then(onSettingsAcquired, getErrorHandler("Error getting settings in settings page."));
		}
		isFocused = true;
	};

	window.onblur = ev => {
		isFocused = false;
	};

	// register events for more button clicks

	page.addEngineButton.onclick = ev => {
		let searchUrl = "https://www.google.com/search?q={searchTerms}";	// use google as an example

		settings.searchEngines.push({
			type: "custom",
			name: "New Search Engine",
			searchUrl: searchUrl,
			iconUrl: getFaviconForUrl(searchUrl),	// by default try to get a favicon for the domain
			isEnabled: true,
			isEnabledInContextMenu: true,
		});

		saveSettings({ searchEngines: settings.searchEngines });
		updateUIWithSettings();
	};

	page.addSeparatorButton.onclick = ev => {
		settings.searchEngines.push({
			type: "sss",
			id: "separator",
			isEnabled: true,
			isEnabledInContextMenu: true,
		});

		saveSettings({ searchEngines: settings.searchEngines });
		updateUIWithSettings();
	};

	// saves settings to Firefox Sync
	page.saveSettingsToSyncButton.onclick = ev => {
		if (DEBUG) { log("saving!"); }
		// remove useless stuff that doesn't need to be stored
		let settingsStr = runActionOnDietSettings(settings, settings => JSON.stringify(settings));

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

	// confirmation buttons (some buttons make another button show for the actual action and change their own text to "Cancel")

	let setupConfirmationProcessForButton = (mainButton, confirmationButton, originalMainButtonValue, onConfirm) => {
		// the clicked button becomes a "Cancel" button
		mainButton.onclick = ev => {
			if (mainButton.value === "Cancel") {
				mainButton.value = originalMainButtonValue;
				confirmationButton.style.display = "none";
			} else {
				mainButton.value = "Cancel";
				confirmationButton.style.display = "";
			}
		};

		// the other button appears and does the actual action
		confirmationButton.onclick = ev => {
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
			let searchEngines = settings.searchEngines;	// stash engines
			settings = JSON.parse(JSON.stringify(defaultSettings));	// copy default settings
			settings.searchEngines = searchEngines;	// restore engines
			updateUIWithSettings();
			saveSettings(settings);
		}
	);

	setupConfirmationProcessForButton(page.loadSettingsFromSyncButton, page.loadSettingsFromSyncButton_real, page.loadSettingsFromSyncButton.value,
		() => browser.storage.sync.get().then(chunks => {
			if (DEBUG) { log(chunks); }

			// join all chunks of data we uploaded to sync
			let chunksList = [];
			let p;
			for (let i = 0; (p = chunks["p"+i]) !== undefined; i++) {
				chunksList.push(p);
			}
			let settingsStr = chunksList.join("");

			// now parse and import the settings
			importSettings(JSON.parse(settingsStr));
		}, getErrorHandler("Error getting settings from sync.")));

	// finish and set elements based on settings, if they are already loaded

	hasPageLoaded = true;

	if (settings !== undefined) {
		updateUIWithSettings();
	}

	// make page content visible, but only after a minimum of time, so that the UI adjusts beforehand
	setTimeout(() => {
		document.body.style.display = "inherit";
	}, 0);
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
		// all settings are saved with the same name as the input elements in the page
		if (!(item.name in settings)) {
			continue;
		}

		// each kind of input element has a different value to set
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

	// update color pickers from their hexadecimal text
	updatePickerColor(page.popupBackgroundColorPicker, page.popupBackgroundColor.value);
	updatePickerColor(page.popupHighlightColorPicker, page.popupHighlightColor.value);

	// margin option only appears if using middle click for opening behaviour
	updateSetting_middleMouseSelectionClickMargin(settings.popupOpenBehaviour);
	// nPopupIconsPerRow and iconAlignmentInGrid options only appear if not using a single row of icons
	updateSetting_nPopupIconsPerRow(settings.useSingleRow);
	updateSetting_iconAlignmentInGrid(settings.useSingleRow);

	// calculate storage size (helpful for Firefox Sync)

	calculateAndShowSettingsSize();

	// update engines

	if (settings.searchEngines !== undefined)
	{
		// delete existing engine HTML elements for engines
		let engineParent = page.engines;
		while (engineParent.firstChild) {
			engineParent.removeChild(engineParent.firstChild);
		}

		// add all engines
		for (let i = 0; i < settings.searchEngines.length; i++) {
			let engine = settings.searchEngines[i];
			let engineRow = buildSearchEngineTableRow(engine, i);
			let optionsRow = buildSearchEngineOptionsTableRow(engine, i);
			engineRow.appendChild(optionsRow);
			page.engines.appendChild(engineRow);
		}

		// setup draggable elements to be able to sort engines
		Sortable.create(page.engines, {
			handle: ".engine-dragger",
			onStart: ev => {
				if (DEBUG) { log("start drag", ev.oldIndex); }
			},
			onUpdate: ev => {
				var item = ev.item; // the current dragged HTMLElement
				if (DEBUG) { log("onUpdate", item); }
			},
			onEnd: ev => {
				if (DEBUG) { log("onEnd", settings); }
				settings.searchEngines.splice(ev.newIndex, 0, settings.searchEngines.splice(ev.oldIndex, 1)[0]);
				updateUIWithSettings();
				saveSettings({ searchEngines: settings.searchEngines });
			},
		});
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

// estimates size of settings in bytes and shows warning messages if this is a problem when using Firefox Sync
function calculateAndShowSettingsSize()
{
	if (true) return;	// we don't care about this code until Sync is bug-free

	// let storageSize = runActionOnDietSettings(settings, settings => roughSizeOfObject(settings));
	let storageSize = runActionOnDietSettings(settings, settings => JSON.stringify(settings).length * 2);	// times 2 because each char has size 2 bytes
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

// creates and adds a search engine to the engines table (each in a different row)
function buildSearchEngineTableRow(engine, i)
{
	let row = document.createElement("div");
	row.className = "engine-table-row";

	let engineRow = createCustomElement(
		`<div class="engine-itself"></div>`
	);
	row.appendChild(engineRow);

	// dragger element

	engineRow.appendChild(createCustomElement(
		`<div class="engine-dragger" style="cursor: move;">☰</div>`
	));

	// icon

	let cell = document.createElement("div");
	cell.className = "engine-icon-img";
	let icon;

	if (engine.type === "sss")
	{
		// special SSS icons have data that never changes, so just get it from constants
		let sssIcon = consts.sssIcons[engine.id];

		if (sssIcon.iconPath !== undefined) {
			let iconImgSource = browser.extension.getURL(sssIcon.iconPath);
			icon = setupEngineIcon(iconImgSource, cell, settings);
		}
		// else if (sssIcon.iconCss !== undefined) {
		// 	icon = setupEngineCss(sssIcon, cell, settings);
		// }
	}
	else {
		icon = setupEngineIcon(engine.iconUrl, cell, settings);
	}

	engineRow.appendChild(cell);

	if (engine.type === "sss")
	{
		// create columns for this row, most disabled because special SSS icons can't be edited

		let sssIcon = consts.sssIcons[engine.id];

		// name

		engineRow.appendChild(createCustomElement(
			`<div class="engine-sss engine-sss-name">${sssIcon.name}</div>`
		));

		// description

		engineRow.appendChild(createCustomElement(
			`<div class="engine-sss engine-sss-description">${sssIcon.description}</div>`
		));

		if (engine.id === "separator") {
			engineRow.appendChild(createDeleteButton(i));
		} else {
			engineRow.appendChild(createDeleteButtonEquivalentSpace(i));
		}
	}
	else
	{
		// create columns for normal icons
		engineRow.appendChild(createEngineName(engine));
		let searchLinkCell = createEngineSearchLink(engine)
		engineRow.appendChild(searchLinkCell);
		engineRow.appendChild(createEngineIconLink(engine, icon, searchLinkCell));
		engineRow.appendChild(createDeleteButton(i));
	}

	return row;
}

// creates and adds a row with options for a certain search engine to the engines table
function buildSearchEngineOptionsTableRow(engine, i)
{
	let id = `checkbox_enabled_in_context_menu_${i}`;
	let innerHTML =
		`<div class="engine-options">
			<div>
				<input id="checkbox_enabled_${i}" autocomplete="off" type="checkbox" ${engine.isEnabled ? "checked" : ""}>
				<label for="checkbox_enabled_${i}"> Enabled in popup</label>
			</div>
			<div>
				<input id="checkbox_enabled_in_context_menu_${i}" autocomplete="off" type="checkbox" ${engine.isEnabledInContextMenu ? "checked" : ""}>
				<label for="checkbox_enabled_in_context_menu_${i}"> Enabled in context menu</label>
			</div>
		</div>`;
	// var template = document.createElement('template');
	// template.innerHTML = innerHTML;
	// let row = template.content.firstChild;

	let row = createCustomElement(innerHTML);
	let inputs = row.getElementsByTagName("input");

	let isEnabledCheckbox = inputs[0];

	isEnabledCheckbox.onchange = ev => {
		engine.isEnabled = isEnabledCheckbox.checked;
		saveSettings({ searchEngines: settings.searchEngines });
	};

	let isEnabledInContextMenuCheckbox = inputs[1];

	isEnabledInContextMenuCheckbox.onchange = ev => {
		engine.isEnabledInContextMenu = isEnabledInContextMenuCheckbox.checked;
		saveSettings({ searchEngines: settings.searchEngines });
	};

	return row;
}

// Sets the icon for a search engine in the engines table.
// "data:" links are data, URLs are cached as data too.
function setupEngineIcon(iconImgSource, parent, settings)
{
	let icon = document.createElement("img");

	if (iconImgSource.startsWith("data:") || iconImgSource.startsWith("moz-extension:")) {
		icon.src = iconImgSource;
	} else if (settings.searchEnginesCache[iconImgSource] === undefined && iconImgSource) {
		icon.src = iconImgSource;
		getDataUriFromImgUrl(iconImgSource, function(base64Img) {
			icon.src = base64Img;
			settings.searchEnginesCache[iconImgSource] = base64Img;
			saveSettings({ searchEnginesCache: settings.searchEnginesCache });
		});
	} else {
		icon.src = settings.searchEnginesCache[iconImgSource];
	}

	parent.appendChild(icon);
	return icon;
}

// function setupEngineCss(sssIcon, parent, settings)
// {
// 	let div = document.createElement("div");

// 	// div.style.cssText = sssIcon.iconCss;
// 	div.style.cssText = iconCssText;
// 	div.style.marginBottom = "0px";
// 	div.style.marginTop = "0px";

// 	parent.appendChild(div);
// 	return div;
// }

// sets the name field for a search engine in the engines table
function createEngineName(engine)
{
	let elem = createCustomElement(
		`<div class="engine-name">
			<input value="${engine.name}" type="text">
		</div>`
	);

	let nameInput = elem.getElementsByTagName("input")[0];

	nameInput.onchange = ev => {
		engine.name = nameInput.value;
		saveSettings({ searchEngines: settings.searchEngines });
		calculateAndShowSettingsSize();
	};
	return elem;
}

// sets the search URL field for a search engine in the engines table
function createEngineSearchLink(engine)
{
	let elem = createCustomElement(
		`<div class="engine-search-link">
			<input value="${engine.searchUrl}" type="text">
		</div>`
	);

	let searchLinkInput = elem.getElementsByTagName("input")[0];

	searchLinkInput.previousValue = engine.searchUrl;	// custom attribute that keeps the previous value before a change

	searchLinkInput.onchange = ev => {
		// trim search url and prepend "http://" if it doesn't begin with a protocol
		let url = searchLinkInput.value.trim();
		if (url.length > 0 && !url.match(/^[0-9a-zA-Z\-+]+:\/\//)) {
			url = "http://" + url;
		}

		if (searchLinkInput.previousValue !== url) {
			// if we're using the default favicon search for the previous search url, update it
			if (engine.iconUrl.length == 0 || engine.iconUrl === getFaviconForUrl(searchLinkInput.previousValue)) {
				let iconUrl = getFaviconForUrl(url);
				cell.iconLinkInput.value = iconUrl;	// doesn't trigger oninput or onchange
				setIconUrlInput(engine, cell.iconLinkInput, cell.icon);
			}
			searchLinkInput.previousValue = url;
		}

		// if trimming and checks changed the url, set it on the input element
		if (searchLinkInput.value !== url) {
			searchLinkInput.value = url;
		}

		engine.searchUrl = url;
		saveSettings({ searchEngines: settings.searchEngines });
		calculateAndShowSettingsSize();
	};

	elem.searchLinkInput = searchLinkInput;	// save reference in element
	return elem;
}

// sets the icon URL field for a search engine in the engines table
function createEngineIconLink(engine, icon, searchLinkCell)
{
	let elem = createCustomElement(
		`<div class="engine-icon-link">
			<input value="${engine.iconUrl}" type="text">
		</div>`
	);

	let iconLinkInput = elem.getElementsByTagName("input")[0];

	iconLinkInput.oninput = ev => {
		setIconUrlInput(engine, iconLinkInput, icon);
	};

	iconLinkInput.onchange = ev => {
		if (iconLinkInput.value.length == 0) {
			iconLinkInput.value = getFaviconForUrl(searchLinkCell.searchLinkInput.value);
			setIconUrlInput(engine, iconLinkInput, icon);
		}
		trimSearchEnginesCache(settings);
		saveSettings({ searchEngines: settings.searchEngines, searchEnginesCache: settings.searchEnginesCache });
		calculateAndShowSettingsSize();
	};

	// save the reference to the icon and input field in the search input's cell, as we'll need them to update the default favicon
	searchLinkCell.icon = icon;
	searchLinkCell.iconLinkInput = iconLinkInput;

	return elem;
}

// sets the engine icon from the icon url present in the iconLinkInput input field
function setIconUrlInput(engine, iconLinkInput, icon)
{
	engine.iconUrl = iconLinkInput.value.trim();
	icon.src = engine.iconUrl;
	// if not a data link already, try downloading the image and cache it as one
	if (!engine.iconUrl.startsWith("data:")) {
		getDataUriFromImgUrl(engine.iconUrl, base64Img => {
			icon.src = base64Img;
			settings.searchEnginesCache[engine.iconUrl] = base64Img;
		});
	}
}

// sets the delete button for a search engine in the engines table
function createDeleteButton(i)
{
	let elem = createCustomElement(
		`<div class="engine-delete">
			<input value="✖" type="button">
		</div>`
	);

	let deleteButton = elem.getElementsByTagName("input")[0];

	deleteButton.onclick = ev => {
		settings.searchEngines.splice(i, 1); // remove element at i
		trimSearchEnginesCache(settings);
		updateUIWithSettings();
		saveSettings({ searchEngines: settings.searchEngines, searchEnginesCache: settings.searchEnginesCache });
	};
	return elem;
}

function createDeleteButtonEquivalentSpace(i)
{
	let elem = createCustomElement(
		`<div class="engine-delete"></div>`
	);
	return elem;
}

// removes all non-existent engines from the icon cache
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

function createCustomElement(innerHTML)
{
	var template = document.createElement('template');
	template.innerHTML = innerHTML;
	return template.content.firstChild;
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

// applies a set of settings to the options page (reloads everything as if getting the user settings for the first time)
function importSettings(importedSettings)
{
	if (importedSettings.searchEngines === undefined) {
		if (DEBUG) { log("imported settings are empty!", importedSettings); }
		return;
	}

	importedSettings.searchEnginesCache = {};

	// run compatibility updates in case this is a backup made in an old version of SSS
	browser.runtime.sendMessage({ type: "runBackwardsCompatibilityUpdates", settings: importedSettings }).then(
		(_settings) => {
			settings = _settings;

			if (DEBUG) { log("imported settings!", settings); }
			updateUIWithSettings();
			saveSettings(settings);
		},
		getErrorHandler("Error sending runBackwardsCompatibilityUpdates message from settings.")
	);
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
	// when selecting a color using the picker, disregard alpha (last two chars)
	value = value.substring(0, 7);

	if (picker.value !== value) {
		picker.value = value;
	}
}

function updateSetting_middleMouseSelectionClickMargin(popupOpenBehaviour)
{
	let middleMouseSelectionClickMarginSetting = page["middleMouseSelectionClickMargin"].closest(".setting");
	if (popupOpenBehaviour === consts.PopupOpenBehaviour_MiddleMouse) {
		middleMouseSelectionClickMarginSetting.classList.remove("hidden");
	} else {
		middleMouseSelectionClickMarginSetting.classList.add("hidden");
	}
}

function updateSetting_nPopupIconsPerRow(useSingleRow)
{
	let nPopupIconsPerRowSetting = page["nPopupIconsPerRow"].closest(".setting");
	if (useSingleRow === true) {
		nPopupIconsPerRowSetting.classList.add("hidden");
	} else {
		nPopupIconsPerRowSetting.classList.remove("hidden");
	}
}

function updateSetting_iconAlignmentInGrid(useSingleRow)
{
	let iconAlignmentInGrid = page["iconAlignmentInGrid"].closest(".setting");
	if (useSingleRow === true) {
		iconAlignmentInGrid.classList.add("hidden");
	} else {
		iconAlignmentInGrid.classList.remove("hidden");
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

// gets a much more readable string for a size in bytes (ex.: 25690112 bytes is "24.5MB")
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

// just a wrapper for saving the settings to storage and logging info
function saveSettings(obj)
{
	browser.storage.local.set(obj);
	if (DEBUG) { log("saved!", settings); }
}

function getFaviconForUrl(url)
{
	return "https://api.faviconkit.com/" + getDomainFromUrl(url) + "/64";
	// return "https://www.google.com/s2/favicons?domain=" + getDomainFromUrl(url);	// faster, but only supports 16px icons and no subdomains
}

function getDomainFromUrl(url)
{
	if (url.indexOf("//") !== -1) {
		url = url.split("//")[1];
	}
	url = url.split("/")[0];	// url after domain
	url = url.split(":")[0];	// port
	url = url.split("?")[0];	// args
	return url;
}
