/*

Script that controls how the SSS options page works. Its job is to load the user's settings,
handle dynamic page elements based on that, respond to user input, and detect changes
to the UI that need to be saved back into settings.

How to add a new setting:

- swift-selection-search.ts
	- Add variable to "class Settings".
	- Add its default value to "const defaultSettings".
	- Add it to "function runBackwardsCompatibilityUpdates" and write down the first SSS version where the setting is going to exist.
		- If you don't know, don't worry, it will be filled later.
	- [extra] If needed, add it to "class ActivationSettings" and "function getActivationSettingsForContentScript"
		- This is necessary if the setting affects something that happens before the popup shows up.
- settings.html
	- Create a new setting.
	- [extra] If it depends on another setting, add "hidden" (and perhaps "indent") as a class.
- settings.ts
	- [extra] If it depends on another setting, add both to "const page" object.
	- [extra] If it depends on another setting, create a new "updateSetting_??" function and add it to "function updateSetting".
- page-script.ts
	- Implement! (Unless it's not a setting that affects the page script, of course. ;))

*/

var Sortable;	// avoid TS compilation errors but still get working JS code

namespace SSS_Settings
{
	// NOTE: When adding new references, keep the same order used in the settings page, roughly divided by section.
	const page = {
		engines: undefined,
		inputs: undefined,

		toggleDarkMode: undefined,

		addEngineButton: undefined,
		addSeparatorButton: undefined,
		importBrowserEnginesButton: undefined,
		resetSearchEnginesButton: undefined,

		minSelectedCharacters: undefined,
		maxSelectedCharacters: undefined,
		popupDelay: undefined,
		middleMouseSelectionClickMargin: undefined,
		websiteBlocklist: undefined,

		selectionTextFieldLocation: undefined,
		nPopupIconsPerRow: undefined,
		iconAlignmentInGrid: undefined,
		popupBackgroundColorPicker: undefined,
		popupBackgroundColor: undefined,
		popupHighlightColorPicker: undefined,
		popupHighlightColor: undefined,

		useCustomPopupCSS: undefined,
		customPopupCSS: undefined,

		exportSettingsToFileButton: undefined,
		importSettingsFromFileButton: undefined,
		importSettingsFromFileButton_real: undefined,
		saveSettingsToSyncButton: undefined,
		loadSettingsFromSyncButton: undefined,

		resetSettingsButton: undefined,
	};

	class EncodingGroup
	{
		constructor(public name: string, public encodings: string[][]) { }
	}

	// https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings
	const encodings: EncodingGroup[] =
	[
		new EncodingGroup("Native", [
			[ "Default (UTF-8)", "utf8" ],
			[ "UCS2", "ucs2" ],
			[ "ASCII", "ascii" ],
			// [ "Binary", "binary" ],
			// [ "Base64", "base64" ],
			// [ "Hex", "hex" ],
		]),
		new EncodingGroup("ISO codepages", [
			[ "ISO-8859-1 (Latin-1)", "iso88591" ],
			[ "ISO-8859-16 (Latin-10)", "iso885916" ],
		]),
		new EncodingGroup("Cyrillic (Russia, Ukraine)", [
			[ "KOI8-R", "koi8r" ],
			[ "KOI8-U", "koi8u" ],
			[ "KOI8-RU", "koi8ru" ],
			[ "KOI8-T", "koi8t" ],
			[ "Windows-1251", "windows1251" ],
		]),
		new EncodingGroup("Chinese (China)", [
			[ "GBK", "gbk" ],
			[ "GB 18030", "gb18030" ],
			[ "EUC-CN", "euccn" ],
		]),
		new EncodingGroup("Chinese (Taiwan, Hong Kong)", [
			[ "Big5", "big5" ],
			[ "Code page 950", "cp950" ],
		]),
		new EncodingGroup("Japanese", [
			[ "Shift JIS", "shiftjis" ],
			[ "EUC-JP", "eucjp" ],
		]),
		new EncodingGroup("Korean", [
			[ "EUC-KR", "euckr" ],
		]),
	];

	let settings: SSS.Settings;
	let hasPageLoaded: boolean = false;
	let isFocused: boolean = true;
	let isPendingSettings: boolean = false;

	let DEBUG;
	let log;

	let sssIcons: { [id: string] : SSS.SSSIconDefinition; };
	let defaultSettings: SSS.Settings;
	let browserVersion: number;	// unused for now, but we may want it to control compatibility
	let hasDOMContentLoaded: boolean = false;

	document.addEventListener("DOMContentLoaded", onDOMContentLoaded);

	// ask all needed information from the background script (can't use browser.extension.getBackgroundPage() in private mode, so it has to be this way)

	browser.runtime.sendMessage({ type: "getDataForSettingsPage" }).then(
		data => {
			DEBUG = data.DEBUG;
			browserVersion = data.browserVersion;
			sssIcons = data.sssIcons;
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
	function getErrorHandler(text: string): (reason: any) => void
	{
		if (DEBUG) {
			return error => { log(`${text} (${error})`); };
		} else {
			return undefined;
		}
	}

	function createDefaultEngine(engine)
	{
		engine.isEnabled = true;
		engine.isEnabledInContextMenu = true;
		return engine;
	}

	// adds to SSS all engines from the browser (these are special and contain very little information)
	function addBrowserEnginesToEnginesList(browserSearchEngines: browser.search.SearchEngine[])
	{
		// "hash set" of search URLs (will help avoiding duplicates of previously imported browser engines)
		let names = {};
		for (let engine of settings.searchEngines) {
			if (engine.type === SSS.SearchEngineType.BrowserSearchApi) {
				names[(engine as SSS.SearchEngine_BrowserSearchApi).name] = true;
			}
		}

		let nAddedEngines = 0;

		// add all browser search engines
		for (let engine of browserSearchEngines)
		{
			// avoid duplicates if this browser engine is already in the "hash set"
			if (names.hasOwnProperty(engine.name)) continue;

			// create an engine object compatible with class SearchEngine_BrowserSearchApi
			settings.searchEngines.push(createDefaultEngine({
				type: SSS.SearchEngineType.BrowserSearchApi,
				name: engine.name,
				iconUrl: engine.favIconUrl ?? "",
			}));

			nAddedEngines++;
		}

		if (nAddedEngines == 0) {
			alert("No new engines were added.");
		}
	}

	// Hackish way to get the image data (base64 data:image) from the URL of an image.
	// Sets the URL as img source, waits for download, then scales it down if needed, draws to a canvas and gets the resulting pixel data.
	function getDataUriFromImgUrl(imageUrl, callback)
	{
		var img = new Image();
		img.crossOrigin = "Anonymous";
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
			let canvas = document.createElement("canvas");
			canvas.width = canvas.height = Math.max(width, height);

			// draw image with size and position defined above
			let ctx = canvas.getContext("2d");
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
		// if we have the defaultSettings already, it means we have everything from the background script
		if (defaultSettings !== undefined) {
			onPageLoaded();
		}
		hasDOMContentLoaded = true;
	}

	// main setup for settings page, called when page loads
	function onPageLoaded()
	{
		// save all form elements for easy access

		page.engines = document.getElementById("engines");
		page.inputs = document.querySelectorAll("input, select, textarea");

		for (let item of page.inputs) {
			page[item.name] = item;
		}

		// register change event for anything in the form

		let container: any = document.getElementById("settings");

		container.onchange = ev => {
			let item = ev.target;

			if (DEBUG) { log("onFormChanged target: " + item.name + ", value: " + item.value); }

			// special things in the options page need special code

			if (item.name === "importSettingsFromFileButton_real")
			{
				let reader = new FileReader();
				reader.onload = () => {
					let importedSettings = JSON.parse(reader.result as string);
					importSettings(importedSettings);
					// alert("All settings were imported!");
				};
				reader.readAsText(ev.target.files[0]);
			}
			// otherwise, if not a "special thing", this is a field
			else {
				saveElementValueToSettings(item, true);
			}
		};

		page.importBrowserEnginesButton.onclick = () =>
		{
			if (confirm("Really import your browser's search engines?"))
			{
				browser.search.get().then((browserSearchEngines: browser.search.SearchEngine[]) => {
					if (DEBUG) { log(browserSearchEngines); }
					addBrowserEnginesToEnginesList(browserSearchEngines);
					updateUIWithSettings();
					saveSettings({ searchEngines: settings.searchEngines });
				});
			}
		}

		page.exportSettingsToFileButton.onclick = () =>
		{
			// to save as a file we need the "downloads permission"
			browser.permissions.request({ permissions: ["downloads"] }).then(wasPermissionGranted =>
			{
				if (!wasPermissionGranted) {
					alert("Sorry, you cannot export your file without the \"Downloads\" permission! I know it's weird, but it's really needed. :(");
					return;
				}

				// remove useless stuff that doesn't need to be stored
				var blob = runActionOnDietSettings(settings, (settings: SSS.Settings) => new Blob([JSON.stringify(settings)]));
				// save with current date and time
				let filename = "SSS settings backup (" + new Date(Date.now()).toJSON().replace(/:/g, ".") + ").json";

				browser.downloads.download({
					"saveAs": true,
					"url": URL.createObjectURL(blob),
					"filename": filename,
				});
			});
		};

		// There are two elements for the import button: a button for display and the actual "real" button that lets the user pick the file.
		// This is done because the file picker button can't be formatted and would look very ugly.
		// When we click the visual one, we want to call the real one.
		page.importSettingsFromFileButton.onclick = () => page.importSettingsFromFileButton_real.click();

		// register events for specific behaviour when certain fields change (color pickers change their text and vice versa)
		page.popupBackgroundColorPicker.oninput = () => updateColorText  (page.popupBackgroundColor,       page.popupBackgroundColorPicker.value);
		page.popupBackgroundColor.oninput       = () => updatePickerColor(page.popupBackgroundColorPicker, page.popupBackgroundColor.value);
		page.popupHighlightColorPicker.oninput  = () => updateColorText  (page.popupHighlightColor,        page.popupHighlightColorPicker.value);
		page.popupHighlightColor.oninput        = () => updatePickerColor(page.popupHighlightColorPicker,  page.popupHighlightColor.value);

		// this should use "onfocus" instead of "onclick" but permissions.request can only be called on user input... (it still works with onfocus, but prints errors)
		page.websiteBlocklist.onclick = () => {
			// to use the website blocklist we need the tabs permission
			browser.permissions.request({ permissions: ["tabs"] }).then(wasPermissionGranted =>
			{
				if (!wasPermissionGranted) {
					page.websiteBlocklist.blur();	// remove focus
					alert("Sorry, the website blocklist won't work without the \"Tabs\" permission!");
				}
			});
		};

		// setup reset buttons for each option

		for (let elem of document.getElementsByClassName("setting-reset"))
		{
			let inputElements = elem.getElementsByTagName("input");
			if (inputElements.length == 0) {
				continue;
			}

			inputElements[0].onclick = _ => {
				let parent = elem.closest(".setting");
				let formElement = parent.querySelector(".setting-input") as HTMLFormElement;
				let settingName = formElement.name;

				// register the change and save in storage
				let defaultValue = defaultSettings[settingName];
				settings[settingName] = defaultValue;
				saveSettings({ [settingName]: defaultValue });

				loadSettingValueIntoElement(formElement);
			};
		}

		// sections' collapse/expand code

		let sectionNameElements = document.getElementsByClassName("section-name");

		for (let sectionNameElement of sectionNameElements)
		{
			// toggle entire section on clicking the title, and save in settings the resulting state (open/closed)
			(sectionNameElement as HTMLElement).onclick = () => {
				if (settings.sectionsExpansionState === undefined) {
					settings.sectionsExpansionState = {};
				}
				let isCollapsed = sectionNameElement.parentElement.classList.toggle("collapsed-section");
				settings.sectionsExpansionState[sectionNameElement.parentElement.id] = !isCollapsed;
				saveSettings({ sectionsExpansionState: settings.sectionsExpansionState });
			};
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

		// entering/leaving settings page

		window.onfocus = () => {
			// if settings changed while page was not focused, reload settings and UI
			if (isPendingSettings) {
				browser.storage.local.get().then(onSettingsAcquired, getErrorHandler("Error getting settings in settings page."));
			}
			isFocused = true;
		};

		window.onblur = () => {
			isFocused = false;
		};

		// register events for more button clicks

		page.toggleDarkMode.setDarkModeState = enable => {
			if (enable) {
				document.body.classList.add('dark');
			} else {
				document.body.classList.remove('dark');
			}
		};

		page.toggleDarkMode.onclick = () => {
			settings.useDarkModeInOptionsPage = !settings.useDarkModeInOptionsPage;
			page.toggleDarkMode.setDarkModeState(settings.useDarkModeInOptionsPage);

			saveSettings({ useDarkModeInOptionsPage: settings.useDarkModeInOptionsPage });
		};

		page.addEngineButton.onclick = () => {
			let searchUrl = "https://www.google.com/search?q={searchTerms}";	// use google as an example
			let iconUrl = getIconUrlFromSearchUrl(searchUrl);	// by default try to get a favicon for the domain

			settings.searchEngines.push(createDefaultEngine({
				type: SSS.SearchEngineType.Custom,
				name: "New Search Engine",
				searchUrl: searchUrl,
				iconUrl: iconUrl
			}));

			saveSettings({ searchEngines: settings.searchEngines });
			updateUIWithSettings();
		};

		page.addSeparatorButton.onclick = () => {
			settings.searchEngines.push(createDefaultEngine({
				type: SSS.SearchEngineType.SSS,
				id: "separator",
			}));

			saveSettings({ searchEngines: settings.searchEngines });
			updateUIWithSettings();
		};

		// saves settings to Firefox Sync
		page.saveSettingsToSyncButton.onclick = () => {
			if (DEBUG) { log("saving!"); }

			// remove useless stuff that doesn't need to be stored
			var settingsStr = runActionOnDietSettings(settings, (settings: SSS.Settings) => JSON.stringify(settings));

			// divide into different fields so as not to trigger Firefox's "Maximum bytes per object exceeded ([number of bytes] > 16384 Bytes.)"
			let chunks = {};
			let chunkIndex = 0;
			for (let i = 0, length = settingsStr.length; i < length; i += 1000, chunkIndex++) {
				chunks["p"+chunkIndex] = settingsStr.substring(i, i + 1000);
			}

			browser.storage.sync.clear();
			browser.storage.sync.set(chunks).then(
				() => { if (DEBUG) { log("All settings and engines were saved in Sync!"); } },
				() => { if (DEBUG) { log("Uploading to Sync failed! Is your network working? Are you under the 100KB size limit?"); } }
			);
			if (DEBUG) { log("saved in sync!", chunks); }
		};

		// buttons with confirmation

		page.resetSearchEnginesButton.onclick = () =>
		{
			if (confirm("Really reset search engines to the default ones?"))
			{
				let defaultEngines = JSON.parse(JSON.stringify(defaultSettings.searchEngines));
				settings.searchEngines = defaultEngines;
				updateUIWithSettings();
				saveSettings({ searchEngines: settings.searchEngines });
			}
		};

		page.resetSettingsButton.onclick = () =>
		{
			if (confirm("Really reset all settings to their default values?"))
			{
				let searchEngines = settings.searchEngines;	// stash engines
				settings = JSON.parse(JSON.stringify(defaultSettings));	// copy default settings
				settings.searchEngines = searchEngines;	// restore engines
				updateUIWithSettings();
				saveSettings(settings);
			}
		};

		page.loadSettingsFromSyncButton.onclick = () =>
		{
			if (confirm("Really load all settings from Firefox Sync?"))
			{
				browser.storage.sync.get().then(chunks => {
					if (DEBUG) { log(chunks); }

					// join all chunks of data we uploaded to sync in a list
					let chunksList = [];
					let p;
					for (let i = 0; (p = chunks["p"+i]) !== undefined; i++) {
						chunksList.push(p);
					}

					// parse the chunks into an actual object
					let parsedSettings = parseSyncChunksList(chunksList);

					// finally try importing the read settings
					if (parsedSettings !== null) {
						importSettings(parsedSettings);
					}
				}, getErrorHandler("Error getting settings from sync."));
			}
		};

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

	function parseSyncChunksList(chunksList: string[])
	{
		// NOTE: due to an old SSS bug (now fixed), there can be chunks in Sync that are not actually part of the last "Save to Sync".
		// (For example if the last save uploaded only chunks p0 and p1, but Sync already had chunks p0, p1 AND p2 in there.)
		// Due to this, parsing the concatenated chunks would result in JSON errors, so if they happen we try removing the last chunks
		// one by one until parsing works.
		// The origin of the bug was fixed by clearing all Sync storage before setting new data.
		let settingsStr: string = "";
		let parsedSettings = null;

		while (chunksList.length > 0)
		{
			// compact the list into a large string and try parsing it
			settingsStr = chunksList.join("");

			try {
				parsedSettings = JSON.parse(settingsStr);
				break;	// break from loop if successful
			} catch {
				if (DEBUG) { log("error parsing settings from sync: " + settingsStr); }
				if (DEBUG) { log("trying again with one chunk fewer"); }
				chunksList.pop();
			}
		}

		if (DEBUG) { log("settings from sync, as string: " + settingsStr); }

		return parsedSettings;
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
			isPendingSettings = true;
		}
	}

	function updateUIWithSettings()
	{
		if (DEBUG) { log("updateUIWithSettings", settings); }

		// load UI values from settings

		for (let item of page.inputs) {
			loadSettingValueIntoElement(item);
		}

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

			let currentlyExpandedEngineOptions = null;

			// add all engines
			for (let i = 0; i < settings.searchEngines.length; i++)
			{
				let engine = settings.searchEngines[i];

				let tableRow = buildSearchEngineTableRow();

				let engineRow = buildSearchEngineRow(engine, i);
				tableRow.appendChild(engineRow);
				let optionsRow = buildSearchEngineOptionsTableRow(engine, i);
				tableRow.appendChild(optionsRow);

				// expand engine options when clicking somewhere in the engine (and guarantee there's only one expanded at any time)
				tableRow.onclick = ev => {
					if (currentlyExpandedEngineOptions !== null && currentlyExpandedEngineOptions !== optionsRow) {
						currentlyExpandedEngineOptions.style.display = "none";
					}
					optionsRow.style.display = "initial";
					currentlyExpandedEngineOptions = optionsRow;
					ev.stopPropagation();
				};

				page.engines.appendChild(tableRow);
			}

			// set an event to close any expanded engine options when clicking outisde a section
			document.onclick = ev => {
				if (currentlyExpandedEngineOptions !== null) {
					// hide if neither itself or any parent has the "section" class
					if ((ev.target as Element).closest(".section") === null) {
						currentlyExpandedEngineOptions.style.display = "none";
					}
				}
			};

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

		// set dark/light mode

		page.toggleDarkMode.setDarkModeState(settings.useDarkModeInOptionsPage);
	}

	function saveElementValueToSettings(item: HTMLFormElement, didElementValueChange: boolean = false): boolean
	{
		let name = item.name;

		if (!(name in settings)) {
			return false;
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

		if (didElementValueChange)
		{
			updateSetting(name, value);
		}

		// register the change and save in storage
		settings[name] = value;
		saveSettings({ [name]: value });

		return true;
	}

	function loadSettingValueIntoElement(item: HTMLFormElement): boolean
	{
		let name = item.name;

		// all settings are saved with the same name as the input elements in the page
		if (!(name in settings)) {
			return false;
		}

		let value = settings[name];

		// each kind of input element has a different value to set
		if (item.type === "checkbox") {
			item.checked = value;
		} else {
			item.value = value;
		}

		updateSetting(name, value);

		return true;
	}

	function updateSetting(name: string, value: any)
	{
		switch (name)
		{
			// update color pickers from their hexadecimal text
			case "popupBackgroundColor":
				updatePickerColor(page.popupBackgroundColorPicker, value);
				break;
			case "popupHighlightColor":
				updatePickerColor(page.popupHighlightColorPicker, value);
				break;
			// some options only appear if some other option has a certain value
			case "popupOpenBehaviour":
				updateSetting_popupDelay(value);
				updateSetting_minSelectedCharacters(value);
				updateSetting_maxSelectedCharacters(value);
				updateSetting_middleMouseSelectionClickMargin(value);
				break;
			case "showSelectionTextField":
				updateSetting_selectionTextFieldLocation(value);
				break;
			case "useSingleRow":
				updateSetting_nPopupIconsPerRow(value);
				updateSetting_iconAlignmentInGrid(value);
				break;
			case "useCustomPopupCSS":
				updateSetting_customPopupCSS(value);
				break;
		}
	}

	// estimates size of settings in bytes and shows warning messages if this is a problem when using Firefox Sync
	function calculateAndShowSettingsSize()
	{
		// let storageSize = runActionOnDietSettings(settings, settings => roughSizeOfObject(settings));
		let storageSize = runActionOnDietSettings(settings, settings => JSON.stringify(settings).length * 2);	// times 2 because each char has size 2 bytes
		if (storageSize > 100 * 1024) {
			for (let elem of document.getElementsByClassName("warn-when-over-storage-limit")) {
				(elem as HTMLElement).style.color = "red";
			}
		} else {
			for (let elem of document.getElementsByClassName("warn-when-over-storage-limit")) {
				(elem as HTMLElement).style.color = "";
			}
		}
		let storageSizeElement = document.getElementById("storage-size");
		storageSizeElement.textContent = getSizeWithUnit(storageSize);
	}

	// creates a row for the engines table
	function buildSearchEngineTableRow()
	{
		let parent = document.createElement("div");
		parent.className = "engine-table-row";
		return parent;
	}

	// creates a search engine for the engines table (each in a different row)
	function buildSearchEngineRow(engine, i)
	{
		let engineRow = document.createElement("div");
		engineRow.className = "engine-itself";

		// dragger element

		let dragger = document.createElement("div");
		dragger.className = "engine-dragger";
		dragger.textContent = "☰";
		dragger.style.cursor = "move";
		engineRow.appendChild(dragger);

		// "is enabled" element

		let isEnabledCheckboxParent = document.createElement("div");
		isEnabledCheckboxParent.className = "engine-is-enabled";

		let isEnabledCheckbox = document.createElement("input");
		isEnabledCheckbox.type = "checkbox";
		isEnabledCheckbox.checked = engine.isEnabled;
		isEnabledCheckbox.autocomplete = "off";
		isEnabledCheckbox.title = "Show in popup";
		isEnabledCheckbox.onchange = () => {
			setEnabledInPopup(engine, i, isEnabledCheckbox.checked);
		};
		isEnabledCheckboxParent.appendChild(isEnabledCheckbox);

		engineRow.appendChild(isEnabledCheckboxParent);

		// "is enabled in context menu" element

		let isEnabledInContextMenuCheckboxParent = document.createElement("div");
		isEnabledInContextMenuCheckboxParent.className = "engine-is-enabled-in-context-menu";

		let isEnabledInContextMenuCheckbox = document.createElement("input");
		isEnabledInContextMenuCheckbox.type = "checkbox";
		isEnabledInContextMenuCheckbox.checked = engine.isEnabledInContextMenu;
		isEnabledInContextMenuCheckbox.autocomplete = "off";
		isEnabledInContextMenuCheckbox.title = "Show in context menu";
		isEnabledInContextMenuCheckbox.onchange = () => {
			setEnabledInContextMenu(engine, i, isEnabledInContextMenuCheckbox.checked);
		};
		isEnabledInContextMenuCheckboxParent.appendChild(isEnabledInContextMenuCheckbox);

		engineRow.appendChild(isEnabledInContextMenuCheckboxParent);

		// icon

		let iconElem = document.createElement("div");
		iconElem.className = "engine-icon-img";

		let icon;

		if (engine.type === SSS.SearchEngineType.SSS)
		{
			// special SSS icons have data that never changes, so just get it from constants
			let sssIcon = sssIcons[engine.id];

			if (sssIcon.iconPath !== undefined) {
				let iconImgSource = browser.extension.getURL(sssIcon.iconPath);
				icon = setupEngineIcon(iconImgSource, iconElem, settings);
			}
		}
		else {
			icon = setupEngineIcon(engine.iconUrl, iconElem, settings);
		}

		engineRow.appendChild(iconElem);

		if (engine.type === SSS.SearchEngineType.SSS)
		{
			// create columns for this row, most disabled because special SSS icons can't be edited

			let sssIcon = sssIcons[engine.id];

			// name

			let engineName = document.createElement("div");
			engineName.className = "engine-sss engine-sss-name";
			engineName.textContent = sssIcon.name;
			engineRow.appendChild(engineName);

			// description

			let engineDescription = document.createElement("div");
			engineDescription.className = "engine-sss engine-sss-description";
			engineDescription.textContent = sssIcon.description;
			engineRow.appendChild(engineDescription);

			if (engine.id === "separator") {
				engineRow.appendChild(createEngineShortcutFieldDiv());
				engineRow.appendChild(createDeleteButton(i));
			} else {
				engineRow.appendChild(createEngineShortcutField(engine));
				engineRow.appendChild(createDeleteButtonDiv());
			}
		}
		else
		{
			// create columns for normal icons
			engineRow.appendChild(createEngineName(engine));

			// This object keeps references to a few variables so that when the user changes the search URL
			// we can update the icon URL (if it was using the default URL), and when the icon URL is cleared
			// it can use the search URL to generate a new icon URL.
			// Only the anonymous callbacks inside the following functions will use values inside this object.
			let references = {};

			if (engine.type === SSS.SearchEngineType.BrowserSearchApi) {
				let engineDescription = document.createElement("div");
				engineDescription.className = "engine-sss engine-description-small";
				engineDescription.textContent = "Engine managed by the browser.";
				engineRow.appendChild(engineDescription);
			} else {
				engineRow.appendChild(createEngineSearchLink(engine, references));
			}

			engineRow.appendChild(createEngineIconLink(engine, icon, references));
			engineRow.appendChild(createEngineShortcutField(engine));
			engineRow.appendChild(createDeleteButton(i));
		}

		return engineRow;
	}

	// creates and adds a row with options for a certain search engine to the engines table
	function buildSearchEngineOptionsTableRow(engine: SSS.SearchEngine, i: number)
	{
		let engineOptions = document.createElement("div");
		engineOptions.className = "engine-options";

		if (engine.id === "copyToClipboard")
		{
			let isPlainTextCheckboxParent = createCheckbox(
				"Copy as plain-text",
				`copy-as-plain-text`,
				engine.isPlainText,
				isOn => {
					engine.isPlainText = isOn;
					saveSettings({ searchEngines: settings.searchEngines });
				}
			);

			engineOptions.appendChild(isPlainTextCheckboxParent);
		}

		if (engine.type === SSS.SearchEngineType.Custom || engine.type === SSS.SearchEngineType.BrowserLegacy)
		{
			let textEncodingDropdownParent = createDropdown(
				"Text encoding",
				`encoding-dropdown-${i}`,
				encodings,
				engine.encoding,
				value => {
					if (value !== null) {
						engine.encoding = value;
					} else {
						delete engine.encoding;
					}
					saveSettings({ searchEngines: settings.searchEngines });
				}
			);
			textEncodingDropdownParent.title = "If this is a search engine for non-latin alphabets, like Cyrillic, Chinese, Japanese, etc, it might use a different text encoding. You can change it here.";
			engineOptions.appendChild(textEncodingDropdownParent);

			let discardOnOpenCheckboxParent = createCheckbox(
				"Discard on open (Advanced)",
				`discard-on-open-${i}`,
				engine.discardOnOpen,
				isOn => {
					engine.discardOnOpen = isOn;
					saveSettings({ searchEngines: settings.searchEngines });
				}
			);
			discardOnOpenCheckboxParent.title = "Opens the search but discards the resulting page. Useful if this is a \"non-http\" search engine that opens outside the browser, because that would generate an empty tab/page.";
			engineOptions.appendChild(discardOnOpenCheckboxParent);
		}

		if (!engineOptions.hasChildNodes())
		{
			let noExtraOptionsLabel = document.createElement("label");
			noExtraOptionsLabel.textContent = "No extra options.";
			noExtraOptionsLabel.style.color = "#999";
			engineOptions.appendChild(noExtraOptionsLabel);
		}

		return engineOptions;
	}

	function createCheckbox(labelText: string, elementId: string, checked: boolean, onChange: { (isOn: boolean): void; })
	{
		let parent = document.createElement("div");

		let checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = elementId;
		checkbox.checked = checked;
		checkbox.autocomplete = "off";
		checkbox.onchange = () => onChange(checkbox.checked);
		parent.appendChild(checkbox);

		let label = document.createElement("label");
		label.htmlFor = checkbox.id;
		label.textContent = " " + labelText;	// space adds padding between checkbox and label

		parent.appendChild(label);

		return parent;
	}

	function createDropdown(labelText: string, elementId: string, encodingGroups: EncodingGroup[], currentValue: string, onChange: { (value: string): void; })
	{
		let parent = document.createElement("div");

		let dropdown = document.createElement("select");
		dropdown.style.maxWidth = "250px";
		dropdown.style.marginLeft = "10px";

		for (let i = 0; i < encodingGroups.length; i++)
		{
			const encodingGroup = encodingGroups[i];
			var optionGroup = document.createElement("optgroup");
			optionGroup.label = encodingGroup.name;
			dropdown.appendChild(optionGroup);

			for (let j = 0; j < encodingGroup.encodings.length; j++)
			{
				const value = encodingGroup.encodings[j];
				var option = document.createElement("option");
				option.text = value[0];
				option.value = value[1];
				optionGroup.appendChild(option)
			}
		}

		dropdown.id = elementId;
		if (currentValue) {
			dropdown.value = currentValue;
		}
		dropdown.onchange = () => onChange(dropdown.value);

		let label = document.createElement("label");
		label.textContent = " " + labelText;	// space adds padding between checkbox and label

		parent.appendChild(label);
		parent.appendChild(dropdown);

		return parent;
	}

	function setEnabledInPopup(engine: SSS.SearchEngine, i: number, value: boolean)
	{
		let engineRow = page.engines.children[i];

		let checkbox = engineRow.querySelector(".engine-is-enabled input");
		checkbox.checked = value;

		engine.isEnabled = value;
		saveSettings({ searchEngines: settings.searchEngines });
	}

	function setEnabledInContextMenu(engine: SSS.SearchEngine, i: number, value: boolean)
	{
		let engineRow = page.engines.children[i];

		let checkbox = engineRow.querySelector(".engine-is-enabled-in-context-menu input");
		checkbox.checked = value;

		engine.isEnabledInContextMenu = value;
		saveSettings({ searchEngines: settings.searchEngines });
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
				// console.log("\"" + iconImgSource + "\": \"" + base64Img + "\",");
				saveSettings({ searchEnginesCache: settings.searchEnginesCache });
			});
		} else {
			icon.src = settings.searchEnginesCache[iconImgSource];
		}

		parent.appendChild(icon);
		return icon;
	}

	// sets the name field for a search engine in the engines table
	function createEngineName(engine)
	{
		let parent = document.createElement("div");
		parent.className = "engine-name";

		let nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.value = engine.name;
		nameInput.onchange = () => {
			engine.name = nameInput.value;
			saveSettings({ searchEngines: settings.searchEngines });
			calculateAndShowSettingsSize();
		};
		parent.appendChild(nameInput);
		return parent;
	}

	// sets the search URL field for a search engine in the engines table
	function createEngineSearchLink(engine, references)
	{
		let parent = document.createElement("div");
		parent.className = "engine-search-link";

		let searchLinkInput = document.createElement("input");
		searchLinkInput.type = "text";
		searchLinkInput.value = engine.searchUrl;

		let previousSearchLinkInputValue = engine.searchUrl;	// keeps the previous value when it changes

		searchLinkInput.onchange = () => {
			// trim search url and prepend "http://" if it doesn't begin with a protocol
			let url = searchLinkInput.value.trim();
			if (url.length > 0 && !url.match(/^[0-9a-zA-Z\-+]+:(\/\/)?/)) {
				url = "http://" + url;
			}

			if (previousSearchLinkInputValue !== url) {
				// if we're using the default icon source for the previous search url, update it
				if (engine.iconUrl.length == 0 || engine.iconUrl === getIconUrlFromSearchUrl(previousSearchLinkInputValue)) {
					let iconUrl = getIconUrlFromSearchUrl(url);
					references.iconLinkInput.value = iconUrl;	// doesn't trigger oninput or onchange
					setIconUrlInput(engine, references.iconLinkInput, references.icon);
				}
				previousSearchLinkInputValue = url;
			}

			// if trimming and checks changed the url, set it on the input element
			if (searchLinkInput.value !== url) {
				searchLinkInput.value = url;
			}

			engine.searchUrl = url;
			saveSettings({ searchEngines: settings.searchEngines });
			calculateAndShowSettingsSize();
		};

		parent.appendChild(searchLinkInput);
		references.searchLinkInput = searchLinkInput;	// save reference in element
		return parent;
	}

	// sets the icon URL field for a search engine in the engines table
	function createEngineIconLink(engine, icon, references)
	{
		let parent = document.createElement("div");
		parent.className = "engine-icon-link";

		let iconLinkInput = document.createElement("input");
		iconLinkInput.type = "text";
		iconLinkInput.value = engine.iconUrl;

		iconLinkInput.oninput = () => {
			setIconUrlInput(engine, iconLinkInput, icon);
		};

		iconLinkInput.onchange = () => {
			if (iconLinkInput.value.length == 0 && references.searchLinkInput !== undefined) {
				iconLinkInput.value = getIconUrlFromSearchUrl(references.searchLinkInput.value);
				setIconUrlInput(engine, iconLinkInput, icon);
			}
			trimSearchEnginesCache(settings);
			saveSettings({ searchEngines: settings.searchEngines, searchEnginesCache: settings.searchEnginesCache });
			calculateAndShowSettingsSize();
		};

		// save the reference to the icon and input field in the search input's parent, as we'll need them to update the default favicon
		references.icon = icon;
		references.iconLinkInput = iconLinkInput;

		parent.appendChild(iconLinkInput);
		return parent;
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

	function createEngineShortcutField(engine)
	{
		const parent = createEngineShortcutFieldDiv();

		const shortcutField = document.createElement("input");
		shortcutField.type = "text";
		shortcutField.title = "Type a single character to use as a shortcut for this engine. No modifiers are allowed."

		// If this engine already has a shortcut, populate the field with its value.
		if (engine.shortcut) {
			shortcutField.value = engine.shortcut;
		}

		// Disable modifiers when setting shortcuts
		shortcutField.onkeydown = (e) => {
			if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) e.preventDefault();
		};

		// Setting the shortcut
		shortcutField.oninput = (e) => {
			let newValue = shortcutField.value;

			// The shortcut must be a single character.
			if (newValue.length > 1) {
				newValue = newValue[shortcutField.selectionStart-1];	// gets the last inserted char
				shortcutField.value = newValue;
			}

			newValue = newValue.toUpperCase();

			// Only check for duplicate when the user types a new value.
			// Otherwise, this would be called when pressing backspace.
			if (newValue.length > 0 && newValue !== engine.shortcut)
			{
				let engineWithShortcut = settings.searchEngines.find(e => e.shortcut === newValue);
				if (engineWithShortcut)
				{
					let engineName = engineWithShortcut.type === SSS.SearchEngineType.SSS
						? sssIcons[(engineWithShortcut as SSS.SearchEngine_SSS).id].name
						: engineWithShortcut.name;

					const override = confirm(`This shortcut is already assigned to '${engineName}'! Override?`);

					if (override) {
						engine.shortcut = newValue;

						// Overwriting implies emptying the shortcut value of the engine to which it was assigned earlier.
						// This way each engine has an unique shortcut.
						engineWithShortcut.shortcut = undefined;
						updateUIWithSettings();
					} else {
						// If the user decides not to override (cancel), nothing is set.
						shortcutField.value = engine.shortcut || "";
						return;
					}
				}
			}

			engine.shortcut = newValue;
			saveSettings({ searchEngines: settings.searchEngines });
		};

		parent.appendChild(shortcutField);
		return parent;
	}

	function createEngineShortcutFieldDiv()
	{
		let parent = document.createElement("div");
		parent.className = "engine-shortcut";
		return parent;
	}

	// sets the delete button for a search engine in the engines table
	function createDeleteButton(i)
	{
		let parent = createDeleteButtonDiv();

		let deleteButton = document.createElement("input");
		deleteButton.type = "button";
		deleteButton.value = "✖";
		deleteButton.title = "Delete";
		deleteButton.onclick = () => {
			settings.searchEngines.splice(i, 1); // remove element at i
			trimSearchEnginesCache(settings);
			updateUIWithSettings();
			saveSettings({ searchEngines: settings.searchEngines, searchEnginesCache: settings.searchEnginesCache });
		};

		parent.appendChild(deleteButton);
		return parent;
	}

	function createDeleteButtonDiv()
	{
		let parent = document.createElement("div");
		parent.className = "engine-delete";
		return parent;
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

	function updateSetting_popupDelay(popupOpenBehaviour)
	{
		updateSetting_specific(page.popupDelay, popupOpenBehaviour === SSS.PopupOpenBehaviour.Auto);
	}

	function updateSetting_minSelectedCharacters(popupOpenBehaviour)
	{
		updateSetting_specific(page.minSelectedCharacters, popupOpenBehaviour === SSS.PopupOpenBehaviour.Auto);
	}

	function updateSetting_maxSelectedCharacters(popupOpenBehaviour)
	{
		updateSetting_specific(page.maxSelectedCharacters, popupOpenBehaviour === SSS.PopupOpenBehaviour.Auto);
	}

	function updateSetting_middleMouseSelectionClickMargin(popupOpenBehaviour)
	{
		updateSetting_specific(page.middleMouseSelectionClickMargin, popupOpenBehaviour === SSS.PopupOpenBehaviour.MiddleMouse);
	}

	function updateSetting_selectionTextFieldLocation(showSelectionTextField)
	{
		updateSetting_specific(page.selectionTextFieldLocation, showSelectionTextField === true);
	}

	function updateSetting_nPopupIconsPerRow(useSingleRow)
	{
		updateSetting_specific(page.nPopupIconsPerRow, useSingleRow === false);
	}

	function updateSetting_iconAlignmentInGrid(useSingleRow)
	{
		updateSetting_specific(page.iconAlignmentInGrid, useSingleRow === false);
	}

	function updateSetting_customPopupCSS(useCustomPopupCSS)
	{
		updateSetting_specific(page.customPopupCSS, useCustomPopupCSS === true);
	}

	function updateSetting_specific(element: HTMLElement, enabled: boolean)
	{
		let setting = element.closest(".setting");
		if (enabled) {
			setting.classList.remove("hidden");
		} else {
			setting.classList.add("hidden");
		}
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

	function getIconUrlFromSearchUrl(url)
	{
		if (settings.searchEngineIconsSource === SSS.SearchEngineIconsSource.FaviconKit) {
			return "https://api.faviconkit.com/" + getDomainFromUrl(url) + "/64";
		} else {
			return "";
		}
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
}