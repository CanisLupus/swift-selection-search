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
	- [extra] If it depends on another setting, add the relation to the "updateSetting" function.
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
		addGroupButton: undefined,
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
	let uniqueIdToEngineDictionary: { [uniqueId: number] : SSS.SearchEngine; } = {};
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

	async function createDefaultEngine(engine: SSS.SearchEngine): Promise<SSS.SearchEngine>
	{
		engine.uniqueId = await browser.runtime.sendMessage({ type: "generateUniqueEngineId" });
		engine.isEnabled = true;
		engine.isEnabledInContextMenu = true;
		uniqueIdToEngineDictionary[engine.uniqueId] = engine;
		return engine;
	}

	// adds to SSS all engines from the browser (these are special and contain very little information)
	async function addBrowserEnginesToEnginesList(browserSearchEngines: browser.search.SearchEngine[])
	{
		// "hash set" of search URLs (will help avoiding duplicates of previously imported browser engines)
		const names = {};
		for (const engine of settings.searchEngines) {
			if (engine.type === SSS.SearchEngineType.BrowserSearchApi) {
				names[(engine as SSS.SearchEngine_BrowserSearchApi).name] = true;
			}
		}

		let nAddedEngines = 0;

		// add all browser search engines
		for (const browserSearchEngine of browserSearchEngines)
		{
			// avoid duplicates if this browser engine is already in the "hash set"
			if (names.hasOwnProperty(browserSearchEngine.name)) continue;

			// create an engine object compatible with class SearchEngine_BrowserSearchApi
			settings.searchEngines.push(await createDefaultEngine({
				type: SSS.SearchEngineType.BrowserSearchApi,
				name: browserSearchEngine.name,
				iconUrl: browserSearchEngine.favIconUrl ?? "",
			} as SSS.SearchEngine_BrowserSearchApi));

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
		img.onload = _ => {
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
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = Math.max(width, height);

			// draw image with size and position defined above
			const ctx = canvas.getContext("2d");
			ctx.drawImage(img, xPos, yPos, width, height);

			// finally get the image data (base64 data:image)
			const dataURL = canvas.toDataURL();
			if (DEBUG) { log(dataURL.length); }
			if (DEBUG) { log(imageUrl); }
			if (DEBUG) { log(dataURL); }
			callback(dataURL);
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

	function setGroupIconColor(iconCanvas: HTMLCanvasElement, colorAsString: string)
	{
		const iconSize: number = iconCanvas.width;	// same as height

		const ctx = iconCanvas.getContext("2d");
		ctx.clearRect(0, 0, iconSize, iconSize);
		ctx.beginPath();
		ctx.arc(iconSize/2, iconSize/2, iconSize/2, 0, 2 * Math.PI); // (centerX, centerY, radius, startAngle, endAngle)

		// Apply a random color to the icon whenever a group is created. If editing, apply the color that was saved before.
		ctx.fillStyle = colorAsString;
		ctx.fill();
	}

	// generates a random color string like #f6592b
	function generateRandomColorAsString(): string
	{
		function channelToHex(channel) {
			const hex = channel.toString(16);
			return hex.length == 2 ? hex : "0" + hex;	// pad with zero if needed
		}

		return "#" + channelToHex(Math.floor(Math.random() * 256))
				   + channelToHex(Math.floor(Math.random() * 256))
				   + channelToHex(Math.floor(Math.random() * 256));
	}

	// This is called to either create or edit a group.
	// When editing, we pass the group as a parameter.
	function showGroupPopup(groupEngineToEdit: SSS.SearchEngine_Group = null)
	{
		const groupEnginePopup = document.querySelector("#group-popup") as HTMLDivElement;
		groupEnginePopup.classList.remove("hidden");

		// This div overlays the whole page while the popup is showing. Clicking it hides the popup.
		const backgroundDiv = document.querySelector("#group-background-div") as HTMLDivElement;
		backgroundDiv.onclick = _ => hideGroupPopup();

		// Prevent body from scrolling in the background.
		document.body.style.overflow = "hidden";

		const isEditing: boolean = groupEngineToEdit !== null;

		// This array stores the engines that are selected for the group.
		const groupEngineUniqueIds: string[] = isEditing ? [...groupEngineToEdit.enginesUniqueIds] : [];

		// Group icon can be an image or a canvas. We get both elements and use whichever is needed later.
		const groupIconAsImage: HTMLImageElement = document.querySelector("#group-icon-img") as HTMLImageElement;
		const groupIconAsCanvas: HTMLCanvasElement = document.querySelector("#group-icon-canvas") as HTMLCanvasElement;

		const groupColorPicker = document.querySelector("#group-color-picker") as HTMLInputElement;
		let color: string = isEditing ? groupEngineToEdit.color : generateRandomColorAsString();
		let wasIconModifiedByUser: boolean = isEditing && !groupEngineToEdit.iconUrl.startsWith("data:image/png");

		if (wasIconModifiedByUser)
		{
			groupIconAsImage.classList.remove("hidden");
			groupIconAsImage.src = groupEngineToEdit.iconUrl;

			// Implement onclick to ask for confirmation if the icon was hand-modified by the user.
			groupColorPicker.onclick = ev => {
				if (!wasIconModifiedByUser) return;

				if (confirm("Revert to the default icon?")) {
					groupIconAsImage.classList.add("hidden");
					groupIconAsCanvas.classList.remove("hidden");
					setGroupIconColor(groupIconAsCanvas, color);
					groupColorPicker.value = color;
					wasIconModifiedByUser = false;
				} else {
					ev.preventDefault();
				}
			};
		}
		else
		{
			groupIconAsCanvas.classList.remove("hidden");
			setGroupIconColor(groupIconAsCanvas, color);
			groupColorPicker.value = color;
		}

		groupColorPicker.oninput = _ => {
			color = groupColorPicker.value;
			setGroupIconColor(groupIconAsCanvas, color);
		};

		const groupTitleField = document.querySelector("#group-title-field") as HTMLInputElement;
		groupTitleField.placeholder = "Group name";
		groupTitleField.value = isEditing ? groupEngineToEdit.name : "";
		groupTitleField.focus();

		// This stores the rows (node) of the selected engines.
		// Useful when editing a group, to show the engines in the exact order
		// the user selected them when creating it.
		const engineRows = [];

		const selectedEnginesContainer = document.querySelector("#group-selected-engines-container") as HTMLDivElement;		// for engines in the group
		const availableEnginesContainer = document.querySelector("#group-available-engines-container") as HTMLDivElement;	// for engines NOT in the group
		const engineRowTemplate = document.querySelector("#group-engines-list-row-template") as HTMLTemplateElement;	// will be cloned for each engine to create in the list

		const availableEngines = settings.searchEngines.filter(e => e !== groupEngineToEdit && e.type !== SSS.SearchEngineType.SSS);

		for (let i = 0; i < availableEngines.length; i++)
		{
			const engine = availableEngines[i];

			const groupEnginesListRow = engineRowTemplate.content.firstElementChild.cloneNode(true) as HTMLDivElement;

			// HACK-ish. Saves the index to use later when removing the engine from the group and adding it to the available engines again.
			groupEnginesListRow["engineIndex"] = i;

			const dragger = groupEnginesListRow.querySelector(".engine-dragger") as HTMLDivElement;
			dragger.style.display = "none"; // The dragger will only show for the selected engines.

			// When editing, check the engines that are already on the group.
			let isSelected: boolean = isEditing && groupEngineUniqueIds.indexOf(engine.uniqueId) > -1;

			// Clicking on the row itself selects the engine.
			groupEnginesListRow.onclick = _ => {
				if (isSelected) return;

				// if adding a group to this group, make sure it doesn't contain this group (directly or indirectly), as it would create a cycle
				if (isEditing && engine.type === SSS.SearchEngineType.Group)
				{
					// recursively search the clicked group for the engine we're editing
					function findRecursively(groupEngine: SSS.SearchEngine_Group, engineToFind: SSS.SearchEngine): boolean
					{
						for (const engineId of (groupEngine as SSS.SearchEngine_Group).enginesUniqueIds)
						{
							const engine = uniqueIdToEngineDictionary[engineId];

							if (engine.type === SSS.SearchEngineType.Group) {
								if (engine === engineToFind) return true;
								if (findRecursively(engine as SSS.SearchEngine_Group, engineToFind)) return true;
							}
						}
						return false;
					}

					if (findRecursively(engine as SSS.SearchEngine_Group, groupEngineToEdit)) {
						alert("Adding this group engine would create an infinite cycle, since it contains (directly or indirectly) the group you're currently editing. You can't do that! ;)")
						return;
					}
				}

				isSelected = true;

				groupEngineUniqueIds.push(engine.uniqueId);
				dragger.style.display = "block";

				// The first selected engine will be the main one and stays at the top of the list.
				// All the others will be appended after the last selected.
				selectedEnginesContainer.appendChild(groupEnginesListRow);
				saveButton.disabled = false;
			};

			const engineIconImg = groupEnginesListRow.querySelector(".engine-icon-img > img") as HTMLImageElement;
			setupEngineIconImg(engine, engineIconImg);

			const engineName = groupEnginesListRow.querySelector(".engine-in-group-name") as HTMLSpanElement;
			engineName.textContent = (engine as SSS.SearchEngine_NonSSS).name;

			const deleteButton = groupEnginesListRow.querySelector(".group-remove-engine-button > input") as HTMLInputElement;
			deleteButton.onclick = ev => {
				const index = groupEngineUniqueIds.indexOf(engine.uniqueId);
				groupEngineUniqueIds.splice(index, 1);

				// Find the correct place to insert the engine back in the available engines list,
				// even if other engines were removed from there in the meantime.
				const engineIndex = groupEnginesListRow["engineIndex"];
				let wasInserted = false;

				for (const child of availableEnginesContainer.children)
				{
					if (child["engineIndex"] > engineIndex) {
						availableEnginesContainer.insertBefore(groupEnginesListRow, child);
						wasInserted = true;
						break;
					}
				}

				if (!wasInserted) {
					availableEnginesContainer.appendChild(groupEnginesListRow);
				}

				dragger.style.display = "none";
				isSelected = false;
				saveButton.disabled = groupEngineUniqueIds.length === 0;

				ev.stopPropagation();	// block parent from also receiving click and selecting the engine again
			};

			if (isSelected) {
				// engineRows stores the rows in the same order the engines were selected
				// which is the same order in groupEngines. This allows the user to
				// change the position of the engines according to their needs.
				engineRows[groupEngineUniqueIds.indexOf(engine.uniqueId)] = groupEnginesListRow;
				dragger.style.display = "block"; // Show dragger only for the selected engines
			}

			availableEnginesContainer.appendChild(groupEnginesListRow);
		}

		// When editing, place the engines of the group at the top of the list.
		selectedEnginesContainer.append(...engineRows);

		/* ---- Popup footer ---- */
		const cancelButton = document.querySelector("#group-popup-cancel-button") as HTMLInputElement;
		cancelButton.onclick = _ => hideGroupPopup();

		const saveButton = document.querySelector("#group-popup-save-button") as HTMLInputElement;
		saveButton.disabled = groupEngineUniqueIds.length === 0;
		saveButton.onclick = async _ => {
			const groupName = groupTitleField.value.length > 0 ? groupTitleField.value : groupEngineToEdit?.name || "Group";
			const iconUrl: string = wasIconModifiedByUser ? groupIconAsImage.src : groupIconAsCanvas.toDataURL();
			const groupData = {
				name: groupName,
				enginesUniqueIds: groupEngineUniqueIds,
				iconUrl: iconUrl,
				color: color,
				type: SSS.SearchEngineType.Group,
			};

			if (groupEngineToEdit) {
				Object.assign(groupEngineToEdit, groupData);
			} else {
				settings.searchEngines.push(await createDefaultEngine(groupData as SSS.SearchEngine_Group));
			}

			saveSettings({ searchEngines: settings.searchEngines });
			updateUIWithSettings();
			hideGroupPopup();
		};

		// setup draggable elements to be able to sort engines
		const groupPopupSortableManager = Sortable.create(selectedEnginesContainer, {
			handle: ".engine-dragger",
			onEnd: ev => {
				groupEngineUniqueIds.splice(ev.newIndex, 0, groupEngineUniqueIds.splice(ev.oldIndex, 1)[0]);
			},
		});

		groupEnginePopup.onkeydown = ev => {
			switch (ev.key) {
				case "Escape":
					hideGroupPopup();
					break;
				case "Enter":
					saveButton.click();
					break;
			}
		};

		function hideGroupPopup()
		{
			// Hide the popup
			groupEnginePopup.classList.add("hidden");

			selectedEnginesContainer.innerHTML = "";
			availableEnginesContainer.innerHTML = "";

			groupIconAsImage.classList.add("hidden");
			groupIconAsCanvas.classList.add("hidden");

			groupPopupSortableManager.destroy();

			// Make body scrollable again.
			document.body.style.overflow = "auto";
		}
	}

	// main setup for settings page, called when page loads
	function onPageLoaded()
	{
		// save all form elements for easy access

		page.engines = document.querySelector("#engines");
		page.inputs = document.querySelectorAll("input, select, textarea");

		for (const item of page.inputs) {
			page[item.name] = item;
		}

		// register change event for anything in the form

		const container: any = document.querySelector("#settings");

		container.onchange = ev => {
			const item = ev.target;

			if (DEBUG) { log("onFormChanged target: " + item.name + ", value: " + item.value); }

			// special things in the options page need special code

			if (item.name === "importSettingsFromFileButton_real")
			{
				const reader = new FileReader();
				reader.onload = _ => {
					const importedSettings = JSON.parse(reader.result as string);
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

		page.importBrowserEnginesButton.onclick = async _ =>
		{
			if (confirm("Really import your browser's search engines?"))
			{
				const browserSearchEngines: browser.search.SearchEngine[] = await browser.search.get();
				if (DEBUG) { log(browserSearchEngines); }

				await addBrowserEnginesToEnginesList(browserSearchEngines);
				updateUIWithSettings();
				saveSettings({ searchEngines: settings.searchEngines });
			}
		}

		page.exportSettingsToFileButton.onclick = _ =>
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
				const filename = "SSS settings backup (" + new Date(Date.now()).toJSON().replace(/:/g, ".") + ").json";

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
		page.importSettingsFromFileButton.onclick = _ => page.importSettingsFromFileButton_real.click();

		// register events for specific behaviour when certain fields change (color pickers change their text and vice versa)
		page.popupBackgroundColorPicker.oninput = _ => updateColorText  (page.popupBackgroundColor,       page.popupBackgroundColorPicker.value);
		page.popupBackgroundColor.oninput       = _ => updatePickerColor(page.popupBackgroundColorPicker, page.popupBackgroundColor.value);
		page.popupHighlightColorPicker.oninput  = _ => updateColorText  (page.popupHighlightColor,        page.popupHighlightColorPicker.value);
		page.popupHighlightColor.oninput        = _ => updatePickerColor(page.popupHighlightColorPicker,  page.popupHighlightColor.value);

		// this should use "onfocus" instead of "onclick" but permissions.request can only be called on user input... (it still works with onfocus, but prints errors)
		page.websiteBlocklist.onclick = _ => {
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

		for (const elem of document.querySelectorAll(".setting-reset"))
		{
			const inputElements = elem.querySelectorAll("input");
			if (inputElements.length == 0) continue;

			inputElements[0].onclick = _ => {
				const parent = elem.closest(".setting");
				const formElement = parent.querySelector(".setting-input") as HTMLFormElement;
				const settingName = formElement.name;

				// register the change and save in storage
				const defaultValue = defaultSettings[settingName];
				settings[settingName] = defaultValue;
				saveSettings({ [settingName]: defaultValue });

				loadSettingValueIntoElement(formElement);
			};
		}

		// sections' collapse/expand code

		for (const sectionNameElement of document.querySelectorAll(".section-name"))
		{
			// toggle entire section on clicking the title, and save in settings the resulting state (open/closed)
			(sectionNameElement as HTMLElement).onclick = _ => {
				if (settings.sectionsExpansionState === undefined) {
					settings.sectionsExpansionState = {};
				}
				const isCollapsed = sectionNameElement.parentElement.classList.toggle("collapsed-section");
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
					platformSpecificElements = document.querySelectorAll(".os-linux");
					break;
				case "mac":
					platformSpecificElements = document.querySelectorAll(".os-mac");
					break;
				case "win":
				default:
					platformSpecificElements = document.querySelectorAll(".os-windows");
					break;
			}

			for (const elem of platformSpecificElements) {
				elem.style.display = "inline";
			}
		});

		// entering/leaving settings page

		window.onfocus = _ => {
			// if settings changed while page was not focused, reload settings and UI
			if (isPendingSettings) {
				browser.storage.local.get().then(onSettingsAcquired, getErrorHandler("Error getting settings in settings page."));
			}
			isFocused = true;
		};

		window.onblur = _ => {
			isFocused = false;
		};

		// register events for more button clicks

		page.toggleDarkMode.setDarkModeState = enable => {
			if (enable) {
				document.body.classList.add("dark");
			} else {
				document.body.classList.remove("dark");
			}
		};

		page.toggleDarkMode.onclick = _ => {
			settings.useDarkModeInOptionsPage = !settings.useDarkModeInOptionsPage;
			page.toggleDarkMode.setDarkModeState(settings.useDarkModeInOptionsPage);

			saveSettings({ useDarkModeInOptionsPage: settings.useDarkModeInOptionsPage });
		};

		page.addEngineButton.onclick = async _ => {
			const searchUrl = "https://www.google.com/search?q={searchTerms}";	// use google as an example
			const iconUrl = getIconUrlFromSearchUrl(searchUrl);	// by default try to get a favicon for the domain

			settings.searchEngines.push(await createDefaultEngine({
				type: SSS.SearchEngineType.Custom,
				name: "New Search Engine",
				searchUrl: searchUrl,
				iconUrl: iconUrl
			} as SSS.SearchEngine_Custom));

			saveSettings({ searchEngines: settings.searchEngines });
			updateUIWithSettings();
		};

		page.addGroupButton.onclick = _ => {
			showGroupPopup();
		};

		page.addSeparatorButton.onclick = async _ => {
			settings.searchEngines.push(await createDefaultEngine({
				type: SSS.SearchEngineType.SSS,
				id: "separator",
			} as SSS.SearchEngine_SSS));

			saveSettings({ searchEngines: settings.searchEngines });
			updateUIWithSettings();
		};

		// saves settings to Firefox Sync
		page.saveSettingsToSyncButton.onclick = _ => {
			if (DEBUG) { log("saving!"); }

			// remove useless stuff that doesn't need to be stored
			var settingsStr = runActionOnDietSettings(settings, (settings: SSS.Settings) => JSON.stringify(settings));

			// divide into different fields so as not to trigger Firefox's "Maximum bytes per object exceeded ([number of bytes] > 16384 Bytes.)"
			const chunks = {};
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

		page.resetSearchEnginesButton.onclick = _ =>
		{
			if (confirm("Really reset search engines to the default ones?"))
			{
				const defaultEngines = JSON.parse(JSON.stringify(defaultSettings.searchEngines));
				settings.searchEngines = defaultEngines;
				updateUIWithSettings();
				saveSettings({ searchEngines: settings.searchEngines });
			}
		};

		page.resetSettingsButton.onclick = _ =>
		{
			if (confirm("Really reset all settings to their default values?"))
			{
				const searchEngines = settings.searchEngines;	// stash engines
				settings = JSON.parse(JSON.stringify(defaultSettings));	// copy default settings
				settings.searchEngines = searchEngines;	// restore engines
				updateUIWithSettings();
				saveSettings(settings);
			}
		};

		page.loadSettingsFromSyncButton.onclick = _ =>
		{
			if (confirm("Really load all settings from Firefox Sync?"))
			{
				browser.storage.sync.get().then(chunks => {
					if (DEBUG) { log(chunks); }

					// join all chunks of data we uploaded to sync in a list
					const chunksList = [];
					let p;
					for (let i = 0; (p = chunks["p"+i]) !== undefined; i++) {
						chunksList.push(p);
					}

					// parse the chunks into an actual object
					const parsedSettings = parseSyncChunksList(chunksList);

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

		uniqueIdToEngineDictionary = {};
		for (const engine of settings.searchEngines) {
			uniqueIdToEngineDictionary[engine.uniqueId] = engine;
		}

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

		for (const item of page.inputs) {
			loadSettingValueIntoElement(item);
		}

		// calculate storage size (helpful for Firefox Sync)

		calculateAndShowSettingsSize();

		// update engines

		if (settings.searchEngines !== undefined)
		{
			// delete existing engine HTML elements for engines
			const engineParent = page.engines;
			while (engineParent.firstChild) {
				engineParent.removeChild(engineParent.firstChild);
			}

			let currentlyExpandedEngineOptions = null;

			// add all engines
			for (let i = 0; i < settings.searchEngines.length; i++)
			{
				const engine = settings.searchEngines[i];

				const tableRow = buildSearchEngineTableRow();

				const engineRow = buildSearchEngineRow(engine, i);
				tableRow.appendChild(engineRow);
				const optionsRow = buildSearchEngineOptionsTableRow(engine, i);
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
					// hide if neither itself or any parent is a table row
					if ((ev.target as Element).closest(".engine-table-row") === null) {
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
					saveSettings({ searchEngines: settings.searchEngines });
					updateUIWithSettings();
				},
			});
		}

		// collapse or expand sections

		if (settings.sectionsExpansionState !== undefined)
		{
			for (const sectionId of Object.keys(settings.sectionsExpansionState))
			{
				const classList = document.querySelector("#" + sectionId).classList;
				const isExpanded = settings.sectionsExpansionState[sectionId];
				classList.toggle("collapsed-section", !isExpanded);
			}
		}

		// set dark/light mode

		page.toggleDarkMode.setDarkModeState(settings.useDarkModeInOptionsPage);
	}

	function saveElementValueToSettings(item: HTMLFormElement, didElementValueChange: boolean = false): boolean
	{
		const name = item.name;
		if (!(name in settings)) return false;

		// different fields have different ways to get their value
		let value;
		if (item.type === "checkbox") {
			value = item.checked;
		} else if (item.type === "number") {
			value = parseInt(item.value);
		} else {
			value = item.value;
		}

		if (didElementValueChange) {
			updateSetting(name, value);
		}

		// register the change and save in storage
		settings[name] = value;
		saveSettings({ [name]: value });

		return true;
	}

	function loadSettingValueIntoElement(item: HTMLFormElement): boolean
	{
		const name = item.name;

		// all settings are saved with the same name as the input elements in the page
		if (!(name in settings)) return false;

		const value = settings[name];

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
				updateHtmlElementSetting(page.popupDelay, value === SSS.PopupOpenBehaviour.Auto);
				updateHtmlElementSetting(page.minSelectedCharacters, value === SSS.PopupOpenBehaviour.Auto);
				updateHtmlElementSetting(page.maxSelectedCharacters, value === SSS.PopupOpenBehaviour.Auto);
				updateHtmlElementSetting(page.middleMouseSelectionClickMargin, value === SSS.PopupOpenBehaviour.MiddleMouse);;
				break;
			case "showSelectionTextField":
				updateHtmlElementSetting(page.selectionTextFieldLocation, value === true);
				break;
			case "useSingleRow":
				updateHtmlElementSetting(page.nPopupIconsPerRow, value === false);
				updateHtmlElementSetting(page.iconAlignmentInGrid, value === false);
				break;
			case "useCustomPopupCSS":
				updateHtmlElementSetting(page.customPopupCSS, value === true);
				break;
		}

		function updateHtmlElementSetting(element: HTMLElement, enabled: boolean)
		{
			const setting = element.closest(".setting");
			if (enabled) {
				setting.classList.remove("hidden");
			} else {
				setting.classList.add("hidden");
			}
		}
	}

	// estimates size of settings in bytes and shows warning messages if this is a problem when using Firefox Sync
	function calculateAndShowSettingsSize()
	{
		const storageSize = runActionOnDietSettings(settings, settings => JSON.stringify(settings).length * 2);	// times 2 because each char is 2 bytes
		const maxRecommendedStorageSize = 100 * 1024;

		for (const elem of document.querySelectorAll(".warn-when-over-storage-limit")) {
			(elem as HTMLElement).style.color = storageSize > maxRecommendedStorageSize ? "red" : "";
		}

		document.querySelector("#storage-size").textContent = getSizeWithUnit(storageSize);
	}

	// creates a row for the engines table
	function buildSearchEngineTableRow()
	{
		const parent = document.createElement("div");
		parent.className = "engine-table-row";
		return parent;
	}

	// creates a search engine for the engines table (each in a different row)
	function buildSearchEngineRow(engine, i)
	{
		const engineRow = document.createElement("div");
		engineRow.className = "engine-itself";

		// dragger element

		const dragger = createElement_EngineDragger();
		engineRow.appendChild(dragger);

		// "is enabled" element

		const isEnabledCheckboxParent = document.createElement("div");
		isEnabledCheckboxParent.className = "engine-is-enabled";

		const isEnabledCheckbox = document.createElement("input");
		isEnabledCheckbox.type = "checkbox";
		isEnabledCheckbox.checked = engine.isEnabled;
		isEnabledCheckbox.autocomplete = "off";
		isEnabledCheckbox.title = "Show in popup";
		isEnabledCheckbox.onchange = _ => {
			setEnabledInPopup(engine, i, isEnabledCheckbox.checked);
		};
		isEnabledCheckboxParent.appendChild(isEnabledCheckbox);

		engineRow.appendChild(isEnabledCheckboxParent);

		// "is enabled in context menu" element

		const isEnabledInContextMenuCheckboxParent = document.createElement("div");
		isEnabledInContextMenuCheckboxParent.className = "engine-is-enabled-in-context-menu";

		const isEnabledInContextMenuCheckbox = document.createElement("input");
		isEnabledInContextMenuCheckbox.type = "checkbox";
		isEnabledInContextMenuCheckbox.checked = engine.isEnabledInContextMenu;
		isEnabledInContextMenuCheckbox.autocomplete = "off";
		isEnabledInContextMenuCheckbox.title = "Show in context menu";
		isEnabledInContextMenuCheckbox.onchange = _ => {
			setEnabledInContextMenu(engine, i, isEnabledInContextMenuCheckbox.checked);
		};
		isEnabledInContextMenuCheckboxParent.appendChild(isEnabledInContextMenuCheckbox);

		engineRow.appendChild(isEnabledInContextMenuCheckboxParent);

		// icon

		const engineIcon = document.createElement("div");
		engineIcon.className = "engine-icon-img";
		const iconImg = document.createElement("img");
		engineIcon.appendChild(iconImg);
		setupEngineIconImg(engine, iconImg);

		engineRow.appendChild(engineIcon);

		if (engine.type === SSS.SearchEngineType.SSS)
		{
			// create columns for this row, most disabled because special SSS icons can't be edited

			const sssIcon = sssIcons[engine.id];

			// name

			const engineName = document.createElement("div");
			engineName.className = "engine-sss engine-sss-name";
			engineName.textContent = sssIcon.name;
			engineRow.appendChild(engineName);

			// description

			const engineDescription = document.createElement("div");
			engineDescription.className = "engine-sss engine-sss-description";
			engineDescription.textContent = sssIcon.description;
			engineRow.appendChild(engineDescription);

			if (engine.id === "separator") {
				engineRow.appendChild(createElement_EngineShortcutFieldDiv());
				engineRow.appendChild(createElement_DeleteButton(i));
			} else {
				engineRow.appendChild(createElement_EngineShortcutField(engine));
				engineRow.appendChild(createElement_DeleteButtonDiv());
			}
		}
		else
		{
			// create columns for normal icons
			engineRow.appendChild(createElement_EngineName(engine));

			// This object keeps references to a few variables so that when the user changes the search URL
			// we can update the icon URL (if it was using the default URL), and when the icon URL is cleared
			// it can use the search URL to generate a new icon URL.
			// Only the anonymous callbacks inside the following functions will use values inside this object.
			const references = {};

			if (engine.type === SSS.SearchEngineType.BrowserSearchApi)
			{
				const engineDescription = document.createElement("div");
				engineDescription.className = "engine-sss engine-description-small";
				engineDescription.textContent = "[Browser] Engine imported from the browser.";
				engineRow.appendChild(engineDescription);
			}
			else if (engine.type === SSS.SearchEngineType.Group)
			{
				// create columns for groups
				const engineDescription = document.createElement("div");
				engineDescription.title = "Click to edit this group";
				engineDescription.className = "engine-sss engine-description-small group-engine-description";
				engineDescription.textContent = getGroupEngineDescription(engine);
				engineDescription.onclick = _ => showGroupPopup(engine);
				engineRow.appendChild(engineDescription);
			}
			else
			{
				engineRow.appendChild(createElement_EngineSearchLink(engine, references));
			}

			engineRow.appendChild(createElement_EngineIconLink(engine, iconImg, references));
			engineRow.appendChild(createElement_EngineShortcutField(engine));
			engineRow.appendChild(createElement_DeleteButton(i));
		}

		return engineRow;
	}

	function getGroupEngineDescription(groupEngine: SSS.SearchEngine_Group): string
	{
		// Create a comma-separated string containing the names of the engines.
		return groupEngine.enginesUniqueIds
			.map(engineId => {
				const engine = uniqueIdToEngineDictionary[engineId];
				return engine.type === SSS.SearchEngineType.SSS
					? sssIcons[(engine as SSS.SearchEngine_SSS).id].name
					: (engine as SSS.SearchEngine_NonSSS).name;
			})
			.join(", ");
	}

	function createElement_EngineDragger(): HTMLDivElement
	{
		const dragger = document.createElement("div");
		dragger.className = "engine-dragger";
		dragger.textContent = "☰";
		return dragger;
	}

	function setupEngineIconImg(engine: SSS.SearchEngine, iconImg: HTMLImageElement)
	{
		let iconImgSource;

		if (engine.type === SSS.SearchEngineType.SSS) {
			// special SSS icons have data that never changes, so just get it from constants
			const sssIcon = sssIcons[(engine as SSS.SearchEngine_SSS).id];
			iconImgSource = browser.extension.getURL(sssIcon.iconPath);
		} else {
			iconImgSource = (engine as SSS.SearchEngine_NonSSS).iconUrl;
		}

		// Sets the icon for a search engine.
		// "data:" links are data, URLs are cached as data too.
		if (iconImgSource.startsWith("data:") || iconImgSource.startsWith("moz-extension:")) {
			iconImg.src = iconImgSource;
		} else if (settings.searchEnginesCache[iconImgSource] === undefined && iconImgSource) {
			iconImg.src = iconImgSource;
			getDataUriFromImgUrl(iconImgSource, base64Img => {
				iconImg.src = base64Img;
				settings.searchEnginesCache[iconImgSource] = base64Img;
				// console.log("\"" + iconImgSource + "\": \"" + base64Img + "\",");
				saveSettings({ searchEnginesCache: settings.searchEnginesCache });
			});
		} else {
			iconImg.src = settings.searchEnginesCache[iconImgSource];
		}
	}

	// creates and adds a row with options for a certain search engine to the engines table
	function buildSearchEngineOptionsTableRow(engine: SSS.SearchEngine, i: number)
	{
		const engineOptions = document.createElement("div");
		engineOptions.className = "engine-options";

		if (engine.type === SSS.SearchEngineType.SSS && (engine as SSS.SearchEngine_SSS).id === "copyToClipboard")
		{
			const copyEngine = engine as SSS.SearchEngine_SSS_Copy;

			const isPlainTextCheckboxParent = createCheckbox(
				"Copy as plain-text",
				`copy-as-plain-text`,
				copyEngine.isPlainText,
				isOn => {
					copyEngine.isPlainText = isOn;
					saveSettings({ searchEngines: settings.searchEngines });
				}
			);

			engineOptions.appendChild(isPlainTextCheckboxParent);
		}

		if (engine.type === SSS.SearchEngineType.Custom)
		{
			const customEngine = engine as SSS.SearchEngine_Custom;

			const textEncodingDropdownParent = createDropdown(
				"Text encoding",
				`encoding-dropdown-${i}`,
				encodings,
				customEngine.encoding,
				value => {
					if (value !== null) {
						customEngine.encoding = value;
					} else {
						delete customEngine.encoding;
					}
					saveSettings({ searchEngines: settings.searchEngines });
				}
			);
			textEncodingDropdownParent.title = "If this is a search engine for non-latin alphabets, like Cyrillic, Chinese, Japanese, etc, it might use a different text encoding. You can change it here.";
			engineOptions.appendChild(textEncodingDropdownParent);

			const discardOnOpenCheckboxParent = createCheckbox(
				"Discard on open (Advanced)",
				`discard-on-open-${i}`,
				customEngine.discardOnOpen,
				isOn => {
					customEngine.discardOnOpen = isOn;
					saveSettings({ searchEngines: settings.searchEngines });
				}
			);
			discardOnOpenCheckboxParent.title = "Opens the search but discards the resulting page. Useful if this is a \"non-http\" search engine that opens outside the browser, because that would generate an empty tab/page.";
			engineOptions.appendChild(discardOnOpenCheckboxParent);
		}

		if (!engineOptions.hasChildNodes())
		{
			const noExtraOptionsLabel = document.createElement("label");
			noExtraOptionsLabel.textContent = "No extra options.";
			noExtraOptionsLabel.style.color = "#999";
			engineOptions.appendChild(noExtraOptionsLabel);
		}

		return engineOptions;
	}

	function createCheckbox(labelText: string, elementId: string, checked: boolean, onChange: { (isOn: boolean): void; })
	{
		const parent = document.createElement("div");

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = elementId;
		checkbox.checked = checked;
		checkbox.autocomplete = "off";
		checkbox.onchange = _ => onChange(checkbox.checked);
		parent.appendChild(checkbox);

		const label = document.createElement("label");
		label.htmlFor = checkbox.id;
		label.textContent = " " + labelText;	// space adds padding between checkbox and label

		parent.appendChild(label);

		return parent;
	}

	function createDropdown(labelText: string, elementId: string, encodingGroups: EncodingGroup[], currentValue: string, onChange: { (value: string): void; })
	{
		const parent = document.createElement("div");

		const dropdown = document.createElement("select");
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
		dropdown.onchange = _ => onChange(dropdown.value);

		const label = document.createElement("label");
		label.textContent = " " + labelText;	// space adds padding between checkbox and label

		parent.appendChild(label);
		parent.appendChild(dropdown);

		return parent;
	}

	function setEnabledInPopup(engine: SSS.SearchEngine, i: number, value: boolean)
	{
		const engineRow = page.engines.children[i];

		const checkbox = engineRow.querySelector(".engine-is-enabled input");
		checkbox.checked = value;

		engine.isEnabled = value;
		saveSettings({ searchEngines: settings.searchEngines });
	}

	function setEnabledInContextMenu(engine: SSS.SearchEngine, i: number, value: boolean)
	{
		const engineRow = page.engines.children[i];

		const checkbox = engineRow.querySelector(".engine-is-enabled-in-context-menu input");
		checkbox.checked = value;

		engine.isEnabledInContextMenu = value;
		saveSettings({ searchEngines: settings.searchEngines });
	}

	// sets the name field for a search engine in the engines table
	function createElement_EngineName(engine)
	{
		const parent = document.createElement("div");
		parent.className = "engine-name";

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.value = engine.name;
		nameInput.onchange = _ => {
			engine.name = nameInput.value;

			// make sure groups containing this engine get the updated engine name in their descriptions

			const groupEngines = settings.searchEngines.filter(engine => engine.type === SSS.SearchEngineType.Group);
			const groupEngineDescriptions = document.querySelectorAll(".group-engine-description");

			for (let i = 0; i < groupEngines.length; i++) {
				groupEngineDescriptions[i].textContent = getGroupEngineDescription(groupEngines[i] as SSS.SearchEngine_Group);
			}

			saveSettings({ searchEngines: settings.searchEngines });
			calculateAndShowSettingsSize();
		};

		parent.appendChild(nameInput);
		return parent;
	}

	// sets the search URL field for a search engine in the engines table
	function createElement_EngineSearchLink(engine, references)
	{
		const parent = document.createElement("div");
		parent.className = "engine-search-link";

		const searchLinkInput = document.createElement("input");
		searchLinkInput.type = "text";
		searchLinkInput.value = engine.searchUrl;

		let previousSearchLinkInputValue = engine.searchUrl;	// keeps the previous value when it changes

		searchLinkInput.onchange = _ => {
			// trim search url and prepend "http://" if it doesn't begin with a protocol
			let url = searchLinkInput.value.trim();
			if (url.length > 0 && !url.match(/^[0-9a-zA-Z\-+]+:(\/\/)?/)) {
				url = "http://" + url;
			}

			if (previousSearchLinkInputValue !== url) {
				// if we're using the default icon source for the previous search url, update it
				if (engine.iconUrl.length == 0 || engine.iconUrl === getIconUrlFromSearchUrl(previousSearchLinkInputValue)) {
					const iconUrl = getIconUrlFromSearchUrl(url);
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
	function createElement_EngineIconLink(engine, icon, references)
	{
		const parent = document.createElement("div");
		parent.className = "engine-icon-link";

		const iconLinkInput = document.createElement("input");
		iconLinkInput.type = "text";
		iconLinkInput.value = engine.iconUrl;

		iconLinkInput.oninput = _ => {
			setIconUrlInput(engine, iconLinkInput, icon);
		};

		iconLinkInput.onchange = _ => {
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

	function createElement_EngineShortcutField(engine)
	{
		const parent = createElement_EngineShortcutFieldDiv();

		const shortcutField = document.createElement("input");
		shortcutField.type = "text";
		shortcutField.title = "Type a single character to use as a shortcut for this engine. Shortcuts can then be used when the popup is visible."

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
				const engineWithShortcut = settings.searchEngines.find(e => e.shortcut === newValue);
				if (engineWithShortcut)
				{
					const engineName = engineWithShortcut.type === SSS.SearchEngineType.SSS
						? sssIcons[(engineWithShortcut as SSS.SearchEngine_SSS).id].name
						: (engineWithShortcut as SSS.SearchEngine_NonSSS).name;

					const override = confirm(`This shortcut is already assigned to "${engineName}"! Override?`);

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

	function createElement_EngineShortcutFieldDiv()
	{
		const parent = document.createElement("div");
		parent.className = "engine-shortcut";
		return parent;
	}

	// sets the delete button for a search engine in the engines table
	function createElement_DeleteButton(i: number): HTMLDivElement
	{
		const parent = createElement_DeleteButtonDiv();

		const deleteButton = document.createElement("input");
		deleteButton.type = "button";
		deleteButton.value = "✖";
		deleteButton.title = "Delete";
		deleteButton.onclick = _ => {
			// Deleting an engine that belongs to one or more groups must also remove it from the groups, so we ask the user for confirmation.
			const engineToDelete = settings.searchEngines[i];
			const groupsContainingEngine = settings.searchEngines.filter(
				engine => engine.type === SSS.SearchEngineType.Group && (engine as SSS.SearchEngine_Group).enginesUniqueIds.indexOf(engineToDelete.uniqueId) > -1
			) as SSS.SearchEngine_Group[];

			if (groupsContainingEngine.length > 0)
			{
				// Create a formatted list with the names of the groups
				const groupNames = groupsContainingEngine.map(group => `\u2022 ${group.name}`).join("\n");

				if (confirm(`This engine will also be removed from the following group(s): \n\n${groupNames}\n\nAre you sure?`)) {
					for (const group of groupsContainingEngine) {
						group.enginesUniqueIds.splice(group.enginesUniqueIds.indexOf(engineToDelete.uniqueId), 1);
					}
				} else {
					return;
				}
			}

			settings.searchEngines.splice(i, 1); // remove element at i
			trimSearchEnginesCache(settings);
			saveSettings({ searchEngines: settings.searchEngines, searchEnginesCache: settings.searchEnginesCache });
			updateUIWithSettings();
		};

		parent.appendChild(deleteButton);
		return parent;
	}

	function createElement_DeleteButtonDiv(): HTMLDivElement
	{
		const parent = document.createElement("div");
		parent.className = "engine-delete";
		return parent;
	}

	// removes all non-existent engines from the icon cache
	function trimSearchEnginesCache(settings)
	{
		const newCache = {};

		for (const engine of settings.searchEngines)
		{
			if (!engine.iconUrl || engine.iconUrl.startsWith("data:")) {
				continue;
			}

			const cachedIcon = settings.searchEnginesCache[engine.iconUrl];
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
		const cache = settings.searchEnginesCache;
		delete settings.searchEnginesCache;
		const result = onCleaned(settings);
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
				saveSettings(settings);
				updateUIWithSettings();
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

	// gets a much more readable string for a size in bytes (ex.: 25690112 bytes is "24.5MB")
	function getSizeWithUnit(size: number)
	{
		let unit = 0;
		while (size >= 1024 && unit <= 2) {
			size /= 1024;
			unit++;
		}

		size = Math.round(size);

		if (unit == 0) return size + "B";
		if (unit == 1) return size + "KB";
		if (unit == 2) return size + "MB";
		return size + "GB";
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