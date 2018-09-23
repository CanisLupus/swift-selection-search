namespace SSS
{
/* ==================================== */
/* ====== Swift Selection Search ====== */
/* ==================================== */

const DEBUG = false;
if (DEBUG) {
	var log = console.log;
}

export abstract class SearchEngine
{
	[key: string]: browser.storage.StorageValue;

	type: SearchEngineType;
	isEnabled: boolean;
	isEnabledInContextMenu: boolean;
}

export class SearchEngine_SSS extends SearchEngine
{
	id: string;
}

export class SearchEngine_Custom extends SearchEngine
{
	name: string;
	searchUrl: string;
	iconUrl: string;
}

export class SearchEngine_Browser extends SearchEngine_Custom
{
}

export class Settings
{
	[key: string]: browser.storage.StorageValue;

	popupOpenBehaviour: PopupOpenBehaviour;
	middleMouseSelectionClickMargin: number;
	popupLocation: PopupLocation;
	minSelectedCharacters: number;
	allowPopupOnEditableFields: boolean;
	hidePopupOnPageScroll: boolean;
	hidePopupOnRightClick: boolean;
	hidePopupOnSearch: boolean;
	popupOpenCommand: string;
	popupDisableCommand: string;
	mouseLeftButtonBehaviour: OpenResultBehaviour;
	mouseMiddleButtonBehaviour: OpenResultBehaviour;
	popupAnimationDuration: number;
	autoCopyToClipboard: AutoCopyToClipboard;
	useSingleRow: boolean;
	nPopupIconsPerRow: number;
	iconAlignmentInGrid: IconAlignment;
	popupItemSize: number;
	popupSeparatorWidth: number;
	popupItemPadding: number;
	popupItemVerticalPadding: number;
	popupItemHoverBehaviour: ItemHoverBehaviour;
	popupItemBorderRadius: number;
	popupBackgroundColor: string;
	popupHighlightColor: string;
	popupPaddingX: number;
	popupPaddingY: number;
	popupOffsetX: number;
	popupOffsetY: number;
	popupBorderRadius: number;
	enableEnginesInContextMenu: boolean;
	contextMenuItemBehaviour: OpenResultBehaviour;
	searchEngines: SearchEngine[];
	searchEnginesCache: { [id: string] : string; };
}

export class ActivationSettings
{
	popupLocation: PopupLocation;
	popupOpenBehaviour: PopupOpenBehaviour;
	middleMouseSelectionClickMargin: number;
	// not a "setting", but needed info for content script
	browserVersion: number;
}

export class ContentScriptSettings
{
	settings: Settings;
	sssIcons: { [id: string] : SSSIconDefinition; };
}

export class SSSIconDefinition
{
	name: string;
	description: string;
	iconPath: string;
	isInteractive: boolean = true;
}

class SSS
{
	settings: Settings;
	activationSettingsForContentScript: ActivationSettings;
	settingsForContentScript: ContentScriptSettings;
}

enum SearchEngineType {
	SSS = "sss",
	Custom = "custom",
	Browser = "browser",
}

enum PopupOpenBehaviour {
	Off = "off",
	Auto = "auto",
	Keyboard = "keyboard",
	HoldAlt = "hold-alt",
	MiddleMouse = "middle-mouse",
}

enum PopupLocation {
	Selection = "selection",
	Cursor = "cursor",
}

enum OpenResultBehaviour {
	ThisTab = "this-tab",
	NewTab = "new-tab",
	NewBgTab = "new-bg-tab",
	NewTabNextToThis = "new-tab-next",
	NewBgTabNextToThis = "new-bg-tab-next",
	NewWindow = "new-window",
	NewBgWindow = "new-bg-window",
}

enum AutoCopyToClipboard {
	Off = "off",
	Always = "always",
}

enum IconAlignment {
	Left = "left",
	Middle = "middle",
	Right = "right",
}

enum ItemHoverBehaviour {
	Nothing = "nothing",
	Highlight = "highlight",
	HighlightAndMove = "highlight-and-move",
}

// not used anymore but needed for retrocompatibility
enum ContextMenuEnginesFilter {
	All = "all",
	SameAsPopup = "same-as-popup",
}

const sssIcons: { [id: string] : SSSIconDefinition; } = {
	copyToClipboard: {
		name: "Copy to clipboard",
		description: "[SSS] Adds a \"Copy selection to clipboard\" icon to the popup.",
		iconPath: "res/sss-engine-icons/copy.png",
		isInteractive: true,
	},
	openAsLink: {
		name: "Open as link",
		description: "[SSS] Adds an \"Open selection as link\" icon to the popup.",
		iconPath: "res/sss-engine-icons/open-link.png",
		isInteractive: true,
	},
	separator: {
		name: "Separator",
		description: "[SSS] Adds a separator.",
		iconPath: "res/sss-engine-icons/separator.png",
		isInteractive: false,
	}
};

// default state of all configurable options
const defaultSettings: Settings = {
	popupOpenBehaviour: PopupOpenBehaviour.Auto,
	middleMouseSelectionClickMargin: 14,
	popupLocation: PopupLocation.Cursor,
	minSelectedCharacters: 0,
	allowPopupOnEditableFields: false,
	hidePopupOnPageScroll: true,
	hidePopupOnRightClick: true,
	hidePopupOnSearch: true,
	popupOpenCommand: "Ctrl+Shift+Space",
	popupDisableCommand: "Ctrl+Shift+U",
	mouseLeftButtonBehaviour: OpenResultBehaviour.ThisTab,
	mouseMiddleButtonBehaviour: OpenResultBehaviour.NewBgTab,
	popupAnimationDuration: 100,
	autoCopyToClipboard: AutoCopyToClipboard.Off,
	useSingleRow: true,
	nPopupIconsPerRow: 4,
	iconAlignmentInGrid: IconAlignment.Middle,
	popupItemSize: 24,
	popupSeparatorWidth: 60,
	popupItemPadding: 2,
	popupItemVerticalPadding: 1,
	popupItemHoverBehaviour: ItemHoverBehaviour.HighlightAndMove,
	popupItemBorderRadius: 0,
	popupBackgroundColor: "#FFFFFF",
	popupHighlightColor: "#3399FF",
	popupPaddingX: 3,
	popupPaddingY: 1,
	popupOffsetX: 0,
	popupOffsetY: 0,
	popupBorderRadius: 2,
	enableEnginesInContextMenu: true,
	contextMenuItemBehaviour: OpenResultBehaviour.NewBgTab,

	searchEngines: [

		// special engines

		createDefaultEngine({
			type: SearchEngineType.SSS,
			id: "copyToClipboard"
		}),
		createDefaultEngine({
			type: SearchEngineType.SSS,
			id: "openAsLink"
		}),
		createDefaultEngine({
			type: SearchEngineType.SSS,
			id: "separator"
		}),

		// actual search engines

		createDefaultEngine({
			type: SearchEngineType.Custom,
			name: "Google",
			searchUrl: "https://www.google.com/search?q={searchTerms}",
			iconUrl: "https://www.google.com/favicon.ico",
		}),
		createDefaultEngine({
			type: SearchEngineType.Custom,
			name: "YouTube",
			searchUrl: "https://www.youtube.com/results?search_query={searchTerms}",
			iconUrl: "https://www.youtube.com/yts/img/favicon_144-vfliLAfaB.png",
		}),
		createDefaultEngine({
			type: SearchEngineType.Custom,
			name: "IMDB",
			searchUrl: "http://www.imdb.com/find?s=all&q={searchTerms}",
			iconUrl: "https://www.imdb.com/favicon.ico",
		}),
		createDefaultEngine({
			type: SearchEngineType.Custom,
			name: "Wikipedia (en)",
			searchUrl: "https://en.wikipedia.org/wiki/Special:Search?search={searchTerms}",
			iconUrl: "https://www.wikipedia.org/favicon.ico",
		}),
		createDefaultEngine({
			type: SearchEngineType.Custom,
			name: "(Example) Search current site on Google",
			searchUrl: "https://www.google.com/search?q={searchTerms} site:{hostname}",
			iconUrl: "https://www.google.com/favicon.ico",
			isEnabled: false,
		}),
		createDefaultEngine({
			type: SearchEngineType.Custom,
			name: "(Example) Translate EN > PT",
			searchUrl: "https://translate.google.com/#en/pt/{searchTerms}",
			iconUrl: "https://translate.google.com/favicon.ico",
			isEnabled: false,
		}),
		createDefaultEngine({
			type: SearchEngineType.Custom,
			name: "(Example) Steam using first result from Google",
			searchUrl: "https://www.google.com/search?btnI&q={searchTerms} site:steampowered.com",
			iconUrl: "https://store.steampowered.com/favicon.ico",
			isEnabled: false,
		}),
	],

	searchEnginesCache: {
		"https://www.google.com/favicon.ico"                        : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEHklEQVRYhb2WXWwUVRTH56XBotQn33wQBXlTov3gQWtErKB9IGkptPYBxYox6INRa0LQQELRYqEJ8NAPLMQ0bCuBVqzQZhGpH91YJGYJaYMW0O1XZnb6xc7u7Nxz9u+D203vzGx3tlZPcl723j2///m4d66ieDRd1/OIqIqIWolokJl1ZraSHiaiweRapa7reV7jZjTTNNcRURszx+DRmDlKRCdN01y7ZDCAlUKIBmYmr2AXIUIIcTgUCuVmm/XjzHxzqWAXIUHTNNd4gluW9RQza26BaHwURvsXmHn/bYS3bYZasgHqi0UIl5Vg+r23YJxuBo3+lU6ECmC9l8wdcJoYw+z+j6BuKoT6QsHivqkQs598CJoYcxWRthKTk5P3u5U91tcD7ZXizGCba6XPwbzS59oO15kQQjTYNxtnTmUNXuhz9ftd2yGEqLeXfp192mN9PWkDT9VUItJyDLFvziHWcx6RluOYerNKhh+pAxKJdPMgpFYQUZvU8/FRaC8/6wDr1VsRvxZwDQoA8cEBhHeU4t7xz9PuSTGIWhVFURQAD9ovmUjjOw749J7XkJibyxg4YUQy7gEAZjY0TVulEFGVFCA6AtG7ArO1j6Tg4W2bwTNTngJnY0S0XSGiVknZnToIfw6EPwfGsYegbclH7NKFZYcnBTQpRDQo/fhrSUqA8Ocgfm41IMR/JSCgMLO+8EfR/7AkgG5ULhpk48GIZ79yU06EmVWFmS1JwOUVkgD+Y9+yCWj/SUKBmeP/q4C2q3FXAWFJgL0FwR3LJqAz4KiA6hzC6y9JAkb7n4DF2Q/hbZUdAq4OyXGIKOByDD9NwS/0rMYzvq3oGvFnLcA3YDkETMzIV/P8MZTGPBG9g6g/F3VdTyPfV4Z8XxlKul5HODbtGX4vlkB5oyHBdzZFHfuIqELRdT2PmaXVowMHUvB5r+79ADPxzFexRUDtmZgj+w5n/w0AD8x/jE4uXByPqCg++6pDROnXu9E/di0t/Nb0Xezq9mHjwVkJXt5oIBp3lL954ed4LbM8aRfv9jsEzHv5t++i4XobOm9dxFe/X8KJYDve8O9Fga8c+b4yFJ2qxfOfhVICfhiW37XMbJmm+Zj9QXLYntGXw91pRWTygvadKD7yi+PsA4AQ4pDjRQRgJTPfsG/u/fNHFJ+tzlpAUUcFWoLdDjgz/wbgvnSP0jXJ16tkE4aGvT8fRWFHuSf47u8+xtDUiBt8EsCjrvAFlVjvJgL4ZzhPD53Hnu8PYEt3DTZ0VqCoowIlXbtQc3kfTgTbMTx12+2vYOZJy7KeXBRuq0TQNdISLFn2xTO3WygUyhVC1NtPR5ZgSwhxCOl67rUaRNSavDi8gg0ianYctX9jmqatIqLtRNRERAFmVpk5nnSViALJtQrM33Ae7G92y3s6IRzKLQAAAABJRU5ErkJggg==",
		"https://www.youtube.com/yts/img/favicon_144-vfliLAfaB.png" : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAA0klEQVRoge2YwQ2EIBREfwmUYCmWYCmWsB1YgqVQEiXMXiDxgCskCEx2XjJHdR75UcFMCCGEqABmDmYrzD4x/hIU5npNus8KM9eyaGmZLqkpXrOSveOfyh8TlHzKQTM2VeMEs210sYpsOYEwQbHSBNrxSZHA6LwnAAAhkAsk9p1cIOEcuUCCXgAAzpNcILEsEtAIVQu0ekZ3AdrXKO2HjPpXolMkMDo5AfotJfemnmmMsuWjAPfBVpTwE5S8i/9ZfuZxKi5eKPfK8XrTkkIIIf6CLwP44M2GNwfzAAAAAElFTkSuQmCC",
		"https://www.imdb.com/favicon.ico"                          : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAE20lEQVRogdWVyW+TVxTFL0hGLKh1LVVCCtgk7226qdRFV911A5VA6qJAQklLNyUQoFIRkxgKAcQkiELiKAlx4ozEGezEsePY2NgJBAJpQqJMTQhVW3VUp3/hdFH5q5/fF7LtW/wWPu/e8875ZH+mZz0Mk6HxbsbfS9JIxrsZ9DTA+OsbaSRPAwx60sX4c0EayZMuBo11Mv6Yk0Yy1smgxx2M32elkTzuYNBoO+O3GWkko+0MGmlj/DotjWSkjUEjLYxfpqSRjLQwKONn/DwpjSTjZ1C6mfHThDSSdDOD0k2MH59LI0k3MSjlY/wwLo0k5WNQspHx/VNpJMlGBj1oYHw3Jo3kQQOD4vWMbx9JI4nXM2i4jvFqVFpMRoogPA6L/R868WpUwluxWdFzz16NSu1MeByr6sLjwBefuZBo91j7+f7eis1KLjuG6xg0XMtYyUiLRKsHRGRR5HZgJSNx7IBL0YkIGxzrsJKRmE8I7YyIsJKRtnouxw64bP2z+usYrmVQzMt4mZYW8Ra9wMu0fQEist3JPVurQHbOrkDW++twkZIxS8zLoKEaxnJKWgz79QLLKYmjn9oXGPZ7Vj1bTukFllMSGxzr1vR49+2NypzzjfVKzuWUxFANg4aqGUtJaRFr1gssJSWOfmIf8u6Fzdj5/ibbs6WkXmApKVHkdiharNmzqn8uXx17U8k6VM2gyF3GYkJaRH15BbY6sJiQOFKqXuDctB5EhCOlLhRtdShalsWEXmAxIa35LFGfR/Mv2eVEyS6noh0pdSlZI3cZNFjFWIhLi2ijXmAhLlGed0E2RG6Y/GALcb3AQtymQKNH8y8vddlquVkHqxgUrmTMx6RFpEEtULjVgfmYRPl+1ax4579PJ/d7mtWyzMf0AvMxicK8ApEGj+Zfvt9lq+VmDVcyaOAOYy4qLQbr9QJzUYnDH6tm+Z/ttLmoXmAuqhcYrPfY+ttpuVkH7jCo/zZjNiIswnVutcAWB2YjAof3qWb+6wXabyJ/Zjai/z/MRgQKt6gFwnVubffwPpetlpu1/zaDQrcYM2Fh0V+rF5gJCxwqUc3s5vJnZsJ6gZmwXqC/1q3tHipx2Wq5WUO3GBS8yZgeEBb9Xj3Y9IBAWZ7Z9IAabs8HzjVnsppWwOvWdstKXLZabtbgTQb13WC8CAmLUI1e4EVIoKxYNXsRUsOVFbvWnMlq+a/bUI1b27XzKyt2KVn7bjCo9zpjKigsgtVqgW0FDkwFBQ7uVc2mggLbCv57ksFqt+1MfoH88ESETGuhtrt7hxO7d6hvtYN7XUrW3usM6rnGmOwVFn1VeoHJXoGDe9QLJnvVAn1VbtuZ/LB22Pnbca+iQMnac41BgauMiW5h0VOpF5joFvh8t3pBvrbazOsCvfPWRqSaCm13P9ruVP5jtr+3Sck50S0QuMqgwBXG84D439Jd6UbSV2h7FrjCoK7LjGddwki6LjPofgVjvFMYyf0KBnVeYjxpF0bSeYlBHRcZY23CSDouMqj9AuNxizCS9gsMajvPeOQXRtJ2nkGt5xijTcJIWs8xqOUsY8QnjKTlLIP8Zxjpe8JI/GcY1Hya8bBeGEnzaQY1nWKk6oSRNJ1ikO8kI1krjMR3kkGNJxgPvMJIGk8wqOE4I14tjKThOIPqv2SYzD/ZLZPkdY1wuAAAAABJRU5ErkJggg==",
		"https://www.wikipedia.org/favicon.ico"                     : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAADH0lEQVRoge1Z7Y3sIAwkVdAGXdACHaQDWkgFFJEKUgIl0AJV4PdrIuAIOMmusnvvTrJ00jrB4xl/oAjR+Usp0SdYL8aPDfoSmKeDuwXi6aBugXg6mNsgng7k/wbwdBC3QTwdwB+ApwP4A4B/tNaklCKlFGmtyRhTWP67tZZSSmx/7z2t63roD9/Re+FnjPkJwHtP1lpSStE0TU2TUtKyLOS9p5QSbdtG8zwXPkIIEkLQNE00zzOt60opJQohkHOOtNY//LXW5JyjEMLhe/Pz4deUUIyRrLV7EPnDMcYmjeu6kpSyeGZZlqZvCKFIknPuUB7Lsux+Wuvm+c0aiDGSMaYAkNPWMmttwQDk0Hu3tfYwKUgMkpdnnVXE27YVWVVKdQ/z3heZPWLMe09SSlJKHQYFc86REOKQzS6AGCPN87xnVAhB27axWOjJY1kWEkLstdE7H0WLmjsFoNa2EIKUUt1DoW+wVrOA7B/puVZAT4osAMhCzkIvGy0WcvrRWTjZN8aQlHLI+nCQOeeKgLTWQxaklHtBgwXvPasZgCmu7xBAjHGXBWxUfHUPt9ayM4o64TDFApDLAgBGmQELeS1gsHEShi7FiY0FIJcFbFSExphisPV6eUuyvQF3GgACygGMshlCKNaF3iTPDdnn+J4CgBbIWS2OQI9a4rquw8F1GUBKaZ+0kMbooLqYR9NXa81m6hKAbdsKWfQKLZcQhwXvPQkhWIV+GQA0msvoqNggHyxk+RxpsQB/TqHfAoAFC9YabBhEyCY60pH0wBZncN0GkLOA7lIPnFrLdUeqawG1cjb7lwFgo2zdFdBJamnVHQm/Y3CNVpSXAsChkIWUcl/ysALXnQSyyjtSjHFfG0ZL4ksBpJSKayd6N6Zoa4fB/aJmARf4q3FcBhBCKIpZSjnc9fM2jC7Gudy8BUDr3jxNU3fbxDM58DNrw0sBtHTNGUL1XOAubW8BgBsb5MDZ9XPmuBvq2wAgo5y7a24o9jPPvA1ACIGstafaIDrS1db5UgBP21d/pfkd38h+BYBvBNH6WP81IJrBfwuIbvCfCqYX4z8UwrBWOPp89wAAAABJRU5ErkJggg==",
		"https://translate.google.com/favicon.ico"                  : "data:image/png;base64,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",
		"https://store.steampowered.com/favicon.ico"                : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA+klEQVQ4jZWTsYqEMBCGUykB9wkmLyWCjegLHMcVaucjCMs111jZbz2wcHA2otj7PP8VMlmX1egOTJEh/zf5J4lSSinf03AlkQGRQRSHIDK2rs6IozjEMPVYxzD1CPRlgRx1FnGgLzYFcgog4vbWAADaW2Prh4AoDi1gHbJOk8wNGOfOeQInoK5r25GZn2bw+fXxsBDF4a53V6RJtgCkUOQlirzE79/dKfz+uT6/ha1NROYFVOTlptVNgECA5b7XHV8AMt09wNFLVb6nkSYZxrlDmmRgZjAziAzGuTsHEIh0FvGe702A72lUVYVh6jFMPYq8dHp/60e6xP9ai/+TMOF37QAAAABJRU5ErkJggg==",
	}
};

let isFirstLoad: boolean = true;
let browserVersion: number = 0;
const sss: SSS = new SSS();

// show message on installation
browser.runtime.onInstalled.addListener(details => {
	if (details.reason == "install") {
		browser.tabs.create({ url: "/res/msg-pages/sss-intro.html" });
	}
});

// get browser version and then startup
browser.runtime.getBrowserInfo().then(browserInfo => {
	browserVersion = parseInt(browserInfo.version.split(".")[0]);
	if (DEBUG) { log("Firefox is version " + browserVersion); }

	// clear all settings (for test purposes)
	// browser.storage.local.clear();
	// browser.storage.sync.clear();

	// register with content script messages and changes to settings
	browser.runtime.onMessage.addListener(onContentScriptMessage);
	browser.storage.onChanged.addListener(onSettingsChanged);

	// Get settings. Setup happens when they are ready.
	browser.storage.local.get().then(onSettingsAcquired, getErrorHandler("Error getting settings for setup."));
});

/* ------------------------------------ */
/* -------------- SETUP --------------- */
/* ------------------------------------ */

// Main SSS setup. Called when settings are acquired. Prepares everything.
function onSettingsAcquired(settings: Settings)
{
	let doSaveSettings = false;

	// If settings object is empty, use defaults.
	if (settings === undefined || isObjectEmpty(settings)) {
		if (DEBUG) { log("Empty settings! Using defaults."); }
		settings = defaultSettings;	// not a copy, but we will exit this function right after
		doSaveSettings = true;
	} else if (isFirstLoad) {
		doSaveSettings = runBackwardsCompatibilityUpdates(settings);
	}

	if (doSaveSettings) {
		browser.storage.local.set(settings);
		return;	// calling "set" will trigger this whole function again, so quit before wasting time
	}

	// save settings and also keep subsets of them for content-script-related purposes
	sss.settings = settings;
	sss.activationSettingsForContentScript = getActivationSettingsForContentScript(settings);
	sss.settingsForContentScript = getPopupSettingsForContentScript(settings);

	if (isFirstLoad) {
		if (DEBUG) { log("loading ", settings); }
	}

	setup_ContextMenu();
	setup_Commands();
	setup_Popup();

	if (isFirstLoad) {
		if (DEBUG) { log("Swift Selection Search has started!"); }
		isFirstLoad = false;
	}
}

// small subset of settings needed for activating content scripts (no need to pass everything if the popup isn't ever called)
function getActivationSettingsForContentScript(settings: Settings): ActivationSettings
{
	let activationSettings = new ActivationSettings();
	activationSettings.popupLocation = settings.popupLocation;
	activationSettings.popupOpenBehaviour = settings.popupOpenBehaviour;
	activationSettings.middleMouseSelectionClickMargin = settings.middleMouseSelectionClickMargin;
	activationSettings.browserVersion = browserVersion;
	return activationSettings;
}

// settings for when a content script needs to show the popup
function getPopupSettingsForContentScript(settings: Settings): ContentScriptSettings
{
	let contentScriptSettings = new ContentScriptSettings();
	contentScriptSettings.settings = Object.assign({}, settings);	// shallow copy
	contentScriptSettings.settings.searchEngines = settings.searchEngines.filter(engine => engine.isEnabled);	// pass only enabled engines
	contentScriptSettings.settings.searchEnginesCache = {};
	contentScriptSettings.sssIcons = sssIcons;	// add information about special SSS icons (normally not in settings because it doesn't change)

	// get icon cache for enabled engines
	for (const engine of contentScriptSettings.settings.searchEngines)
	{
		if (engine.type !== SearchEngineType.SSS)
		{
			let iconCache: string = settings.searchEnginesCache[(engine as SearchEngine_Custom).iconUrl];
			if (iconCache) {
				contentScriptSettings.settings.searchEnginesCache[(engine as SearchEngine_Custom).iconUrl] = iconCache;
			}
		}
	}
	return contentScriptSettings;
}

function runBackwardsCompatibilityUpdates(settings: Settings): boolean
{
	// add settings that were not available in older versions of SSS
	let shouldSave: boolean = false;
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "popupItemVerticalPadding");		// 3.1.0
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "allowPopupOnEditableFields");		// 3.6.0
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "popupBorderRadius");				// 3.9.1
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "popupItemBorderRadius");			// 3.12.0
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "minSelectedCharacters");			// 3.13.0
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "middleMouseSelectionClickMargin");	// 3.14.1
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "hidePopupOnRightClick");			// 3.15.0
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "popupSeparatorWidth");				// 3.21.0
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "popupOpenCommand");				// 3.22.0
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "popupDisableCommand");				// 3.22.0
	shouldSave = shouldSave || createSettingIfNonExistent(settings, "iconAlignmentInGrid");				// 3.25.0

	// 3.7.0
	// convert old unchangeable browser-imported engines to normal ones
	for (let engine of settings.searchEngines)
	{
		if (engine.iconUrl === undefined && engine.type === SearchEngineType.Browser) {
			engine.iconUrl = engine.iconSrc;
			delete engine.iconSrc;
			delete engine.id;
			shouldSave = true;
		}
	}

	// 3.25.0
	// add isEnabledInContextMenu to all engines
	for (let engine of settings.searchEngines)
	{
		if (engine.isEnabledInContextMenu === undefined) {
			engine.isEnabledInContextMenu = engine.type !== SearchEngineType.SSS && (engine.isEnabled || settings.contextMenuEnginesFilter === ContextMenuEnginesFilter.All);
			shouldSave = true;
		}
	}

	return shouldSave;
}

function createSettingIfNonExistent(settings: Settings, settingName: string): boolean
{
	if (settings[settingName] === undefined) {
		settings[settingName] = defaultSettings[settingName];
		return true;
	}
	return false;
}

// whenever settings change, we re-aquire all settings and setup everything again as if just starting
// (definitely not performant, but very robust)
function onSettingsChanged(changes: browser.storage.ChangeDict, area: browser.storage.StorageName)
{
	if (area !== "local" || isObjectEmpty(changes)) {
		return;
	}

	if (DEBUG) { log("onSettingsChanged in " + area); }
	if (DEBUG) { log(changes); }

	browser.storage.local.get().then(onSettingsAcquired, getErrorHandler("Error getting settings after onSettingsChanged."));
}

// default error handler for promises
function getErrorHandler(text: string): (reason: any) => void
{
	if (DEBUG) {
		return error => { log(`${text} (${error})`); };
	} else {
		return undefined;
	}
}

function isObjectEmpty(obj: object): boolean
{
	for (const _ in obj) {
		return false;	// has at least one element
	}
	return true;
}

// act when a content script requests something from this script
function onContentScriptMessage(msg, sender, callbackFunc)
{
	if (DEBUG) {
		if (msg.type !== "log") {
			log("msg.type: " + msg.type);
		}
	}

	switch (msg.type)
	{
		// messages from content script

		case "getActivationSettings":
			callbackFunc(sss.activationSettingsForContentScript);
			break;

		case "getPopupSettings":
			callbackFunc(sss.settingsForContentScript);
			break;

		case "engineClick":
			onSearchEngineClick(msg.engine, msg.clickType, msg.selection, msg.hostname);
			break;

		case "log":
			if (DEBUG) { log("[content script log]", msg.log); }
			break;

		// messages from settings page

		case "getDataForSettingsPage":
			callbackFunc({
				DEBUG: DEBUG,
				browserVersion: browserVersion,
				sssIcons: sssIcons,
				defaultSettings: defaultSettings
			});
			break;

		case "runBackwardsCompatibilityUpdates":
			runBackwardsCompatibilityUpdates(msg.settings);
			callbackFunc(msg.settings);
			break;

		default: break;
	}
}

function createDefaultEngine(engine) : SearchEngine
{
	if (engine.isEnabled === undefined) {
		engine.isEnabled = true;
	}
	if (engine.isEnabledInContextMenu === undefined) {
		engine.isEnabledInContextMenu = engine.isEnabled;
	}

	return engine;
}

/* ------------------------------------ */
/* ----------- CONTEXT MENU ----------- */
/* ------------------------------------ */

function setup_ContextMenu()
{
	// cleanup first
	browser.contextMenus.onClicked.removeListener(onContextMenuItemClicked);
	browser.contextMenus.removeAll();

	if (sss.settings.enableEnginesInContextMenu !== true) {
		return;
	}

	// get only the enabled engines
	let engines: SearchEngine[] = sss.settings.searchEngines.filter(engine => engine.isEnabledInContextMenu);

	// define parent menu
	browser.contextMenus.create({
		id: "sss",
		title: "Search for “%s”",
		contexts: ["selection"],
	});

	// define sub options (one per engine)
	for (const engine of engines)
	{
		let contextMenuOption = {
			id: undefined,
			title: undefined,
			type: undefined,
			parentId: "sss",
			contexts: ["selection" as browser.contextMenus.ContextType],
		};
		// "icons" is also part of contextMenuOption, but only on Firefox 56+, so don't declare it

		if (engine.type === SearchEngineType.SSS) {
			let concreteEngine = engine as SearchEngine_SSS;
			if (concreteEngine.id === "separator") {
				contextMenuOption.type = "separator";
				browser.contextMenus.create(contextMenuOption);
				continue;
			}
			contextMenuOption.id = concreteEngine.id;
			contextMenuOption.title = sssIcons[concreteEngine.id].name;
		} else {
			let concreteEngine = engine as SearchEngine_Custom;
			contextMenuOption.id = concreteEngine.searchUrl;
			contextMenuOption.title = concreteEngine.name;
		}

		// icons are not supported on Firefox 55 and below
		if (browserVersion >= 56)
		{
			let icon;
			if (engine.type === SearchEngineType.SSS) {
				let concreteEngine = engine as SearchEngine_SSS;
				icon = sssIcons[concreteEngine.id].iconPath;
			} else {
				let concreteEngine = engine as SearchEngine_Custom;
				if (concreteEngine.iconUrl.startsWith("data:")) {
					icon = concreteEngine.iconUrl;
				} else {
					icon = sss.settings.searchEnginesCache[concreteEngine.iconUrl];
					if (icon === undefined) {
						icon = concreteEngine.iconUrl;
					}
				}
			}

			contextMenuOption["icons"] = {
				"32": icon,
			};
		}

		browser.contextMenus.create(contextMenuOption);
	}

	browser.contextMenus.onClicked.addListener(onContextMenuItemClicked);
}

function onContextMenuItemClicked(info, tab)
{
	let engine = sss.settings.searchEngines.find(engine => {
		if (engine.type === SearchEngineType.SSS) {
			return (engine as SearchEngine_SSS).id === info.menuItemId;
		} else {
			return (engine as SearchEngine_Custom).searchUrl === info.menuItemId;
		}
	});

	if (engine === undefined) {
		return;
	}

	// check if it's a special SSS engine
	if (engine.type === SearchEngineType.SSS)
	{
		if (engine.id === "copyToClipboard") {
			copyToClipboard();
		}
		else if (engine.id === "openAsLink") {
			let searchUrl = getOpenAsLinkSearchUrl(info.selectionText);
			openUrl(searchUrl, sss.settings.contextMenuItemBehaviour);
		}
	}
	// here we know it's a normal search engine, so run the search
	else
	{
		// search using the engine
		let hostname = new URL(info.pageUrl).hostname;
		let searchUrl = getSearchQuery(engine as SearchEngine_Custom, info.selectionText, hostname);
		openUrl(searchUrl, sss.settings.contextMenuItemBehaviour);
	}
}

/* ------------------------------------ */
/* ------------ SHORTCUTS ------------- */
/* ------------------------------------ */

function setup_Commands()
{
	// clear any old registrations
	if (browser.commands.onCommand.hasListener(onCommand)) {
		browser.commands.onCommand.removeListener(onCommand);
	}

	// register keyboard shortcuts
	if (sss.settings.popupOpenBehaviour !== PopupOpenBehaviour.Off) {
		browser.commands.onCommand.addListener(onCommand);
	}

	if (browserVersion >= 60) {
		updateCommand("open-popup", sss.settings.popupOpenCommand);
		updateCommand("toggle-auto-popup", sss.settings.popupDisableCommand);

		function updateCommand(name, shortcut)
		{
			shortcut = shortcut.trim();

			try {
				browser.commands.update({ name: name, shortcut: shortcut });
			} catch {
				// Since WebExtensions don't provide a way (that I know of) to simply disable a shortcut,
				// if the combination is invalid pick something that is reserved for the browser and so won't work.
				browser.commands.update({ name: name, shortcut: "Ctrl+P" });
			}
		}
	}
}

function onCommand(command: string)
{
	switch (command)
	{
		case "open-popup":        onOpenPopupCommand(); break;
		case "toggle-auto-popup": onToggleAutoPopupCommand(); break;
	}
}

function onOpenPopupCommand()
{
	if (DEBUG) { log("open-popup"); }
	getCurrentTab(tab => browser.tabs.sendMessage(tab.id, { type: "showPopup" }));
}

function onToggleAutoPopupCommand()
{
	if (DEBUG) { log("toggle-auto-popup, sss.settings.popupOpenBehaviour: " + sss.settings.popupOpenBehaviour); }

	// toggles value between Auto and Keyboard
	if (sss.settings.popupOpenBehaviour === PopupOpenBehaviour.Auto) {
		browser.storage.local.set({ popupOpenBehaviour: PopupOpenBehaviour.Keyboard });
	} else if (sss.settings.popupOpenBehaviour === PopupOpenBehaviour.Keyboard) {
		browser.storage.local.set({ popupOpenBehaviour: PopupOpenBehaviour.Auto });
	}
}

/* ------------------------------------ */
/* -------------- POPUP --------------- */
/* ------------------------------------ */

function setup_Popup()
{
	// remove eventual previous registrations
	browser.webNavigation.onDOMContentLoaded.removeListener(onDOMContentLoaded);

	if (sss.settings.popupOpenBehaviour !== PopupOpenBehaviour.Off) {
		// register page load event and try to add the content script to all open pages
		browser.webNavigation.onDOMContentLoaded.addListener(onDOMContentLoaded);
		browser.tabs.query({}).then(installOnOpenTabs, getErrorHandler("Error querying tabs."));
	}
}

function onDOMContentLoaded(details)
{
	injectContentScript(details.tabId, details.frameId, false);
}

function installOnOpenTabs(tabs: browser.tabs.Tab[])
{
	if (DEBUG) { log("installOnOpenTabs"); }

	for (const tab of tabs) {
		injectContentScriptIfNeeded(tab.id, undefined, true);	// inject on all frames if possible
	}
}

function injectContentScriptIfNeeded(tabId: number, frameId?: number, allFrames: boolean = false)
{
	// try sending message to see if content script exists. if it errors then inject it
	browser.tabs.sendMessage(tabId, { type: "isAlive" }).then(
		msg => {
			if (msg === undefined) {
				injectContentScript(tabId, frameId, allFrames);
			}
		},
		() => injectContentScript(tabId, frameId, allFrames)
	);
}

function injectContentScript(tabId: number, frameId?: number, allFrames: boolean = false)
{
	if (DEBUG) { log("injectContentScript " + tabId + " frameId: " + frameId + " allFrames: " + allFrames); }

	let errorHandler = getErrorHandler(`Error injecting page content script in tab ${tabId}.`);

	let executeScriptOptions: browser.extensionTypes.InjectDetails = {
		runAt: "document_start",
		frameId: frameId,
		allFrames: allFrames,
		file: undefined,
		code: undefined,
	};

	// Save function for either calling it as a callback to another function (1), or as its own call (2).
	let injectPageScript = () => {
		executeScriptOptions.file = "/content-scripts/selectionchange.js";
		browser.tabs.executeScript(tabId, executeScriptOptions).then(() => {
			executeScriptOptions.file = "/content-scripts/page-script.js";
			browser.tabs.executeScript(tabId, executeScriptOptions).then(null, errorHandler)
		}, errorHandler);
	};

	// The DEBUG variable is also passed if true, so we only have to declare debug mode once: at the top of this background script.
	if (DEBUG) {
		executeScriptOptions.code = "var DEBUG_STATE = " + DEBUG + ";",
		browser.tabs.executeScript(tabId, executeScriptOptions).then(injectPageScript, errorHandler);	// (1) callback to another function
		executeScriptOptions.code = undefined;	// remove "code" field from object
	} else {
		injectPageScript();	// (2) own call
	}
}

function onSearchEngineClick(selectedEngine: SearchEngine, clickType: string, searchText: string, hostname: string)
{
	// check if it's a special SSS engine
	if (selectedEngine.type === SearchEngineType.SSS)
	{
		if (selectedEngine.id === "copyToClipboard") {
			copyToClipboard();
		}
		else if (selectedEngine.id === "openAsLink") {
			let link: string = getOpenAsLinkSearchUrl(searchText);

			if (DEBUG) { log("open as link: " + link); }

			if (clickType === "leftClick") {
				openUrl(link, sss.settings.mouseLeftButtonBehaviour);
			} else if (clickType === "middleClick") {
				openUrl(link, sss.settings.mouseMiddleButtonBehaviour);
			} else if (clickType === "ctrlClick") {
				openUrl(link, OpenResultBehaviour.NewBgTab);
			}
		}
	}
	// here we know it's a normal search engine, so run the search
	else
	{
		let engine: SearchEngine_Custom = sss.settings.searchEngines.find(
			engine => engine.type !== SearchEngineType.SSS && (engine as SearchEngine_Custom).searchUrl === selectedEngine.searchUrl
		) as SearchEngine_Custom;

		if (clickType === "leftClick") {
			openUrl(getSearchQuery(engine, searchText, hostname), sss.settings.mouseLeftButtonBehaviour);
		} else if (clickType === "middleClick") {
			openUrl(getSearchQuery(engine, searchText, hostname), sss.settings.mouseMiddleButtonBehaviour);
		} else if (clickType === "ctrlClick") {
			openUrl(getSearchQuery(engine, searchText, hostname), OpenResultBehaviour.NewBgTab);
		}
	}
}

function copyToClipboard()
{
	getCurrentTab(tab => browser.tabs.sendMessage(tab.id, { type: "copyToClipboard" }));
}

function getOpenAsLinkSearchUrl(link: string): string
{
	// trim text and add http protocol as default if selected text doesn't have it
	link = link.trim();

	if (!link.includes("://") && !link.startsWith("about:")) {
		link = "http://" + link;
	}

	return link;
}

// gets the complete search URL by applying the selected text to the engine's own searchUrl
function getSearchQuery(engine: SearchEngine_Custom, searchText: string, hostname: string): string
{
	// replace newlines with spaces and encode chars that are not to be used on URLs
	searchText = encodeURIComponent(searchText.trim().replace("\r\n", " ").replace("\n", " "));
	let query = getFilteredSearchUrl(engine.searchUrl, searchText);
	query = query.replace(/\{hostname\}/gi, hostname);	// use regex with "g" flag to match all occurences, "i" ignores case
	return query;
}

function openUrl(urlToOpen: string, openingBehaviour: OpenResultBehaviour)
{
	getCurrentTab(tab => {
		const lastTabIndex: number = 9999;	// "guarantees" tab opens as last for some behaviours
		let options = { url: urlToOpen };

		// "openerTabId" does not exist before Firefox 57
		if (browserVersion >= 57 && openingBehaviour !== OpenResultBehaviour.NewWindow && openingBehaviour !== OpenResultBehaviour.NewBgWindow) {
			options["openerTabId"] = tab.id;
		}

		switch (openingBehaviour)
		{
			case OpenResultBehaviour.ThisTab:
				browser.tabs.update(undefined, options);
				break;
			case OpenResultBehaviour.NewTab:
				options["index"] = lastTabIndex + 1;
				browser.tabs.create(options);
				break;
			case OpenResultBehaviour.NewBgTab:
				options["index"] = lastTabIndex + 1;
				options["active"] = false;
				browser.tabs.create(options);
				break;
			case OpenResultBehaviour.NewTabNextToThis:
				options["index"] = tab.index + 1;
				browser.tabs.create(options);
				break;
			case OpenResultBehaviour.NewBgTabNextToThis:
				options["index"] = tab.index + 1;
				options["active"] = false;
				browser.tabs.create(options);
				break;
			case OpenResultBehaviour.NewWindow:
				browser.windows.create(options);
				break;
			case OpenResultBehaviour.NewBgWindow:
				// options["focused"] = false;	// crashes because it's unsupported by Firefox
				browser.windows.create(options);
				break;
		}
	});
}

function getCurrentTab(callback)
{
	// get the active tab and run a function on it
	browser.tabs.query({currentWindow: true, active: true}).then(
		tabs => callback(tabs[0]),
		getErrorHandler("Error getting current tab.")
	);
}

function getFilteredSearchUrl(url: string, text: string): string
{
	text = text.trim();

	let searchIndex: number = 0;
	let queryParts: string[] = [];

	while (true)
	{
		let [replacements, startIndex, endIndex] = getSearchTermsReplacements(url, searchIndex);

		if (endIndex == -1) {
			break;
		}

		queryParts.push(url.substring(searchIndex, startIndex));
		queryParts.push(replace(text, replacements));
		searchIndex = endIndex;
	}

	queryParts.push(url.substring(searchIndex));
	return queryParts.join("");
}

enum SearchTermsReplacementState {
	EXPECT_REPLACE_PAIR_OR_END,
	EXPECT_REPLACE_SOURCE,
	EXPECT_REPLACE_RESULT,
}

function getSearchTermsReplacements(url: string, startIndexForIndexOf: number): [Array<[string, string]>, number, number]
{
	let startString: string = "{searchTerms";
	let startIndex: number = url.indexOf(startString, startIndexForIndexOf);
	// if searchTerms not found, quit
	if (startIndex === -1) {
		return [[], -1, -1];
	}

	let index: number = startIndex + startString.length;
	// if searchTerms ends immediately with no replacements, quit
	if (url[index] == "}") {
		return [[], startIndex, index+1];
	}

	let state: SearchTermsReplacementState = SearchTermsReplacementState.EXPECT_REPLACE_PAIR_OR_END;
	let replacementSource: string;
	let replacementResult: string;
	let replacements: Array<[string, string]> = [];
	let isEscaped: boolean = false;

	while (index < url.length)
	{
		// get char
		let c: string = url[index];

		if (!isEscaped && c === "\\") {
			isEscaped = true;
			index++;
			continue;
		}

		switch (state)
		{
			case SearchTermsReplacementState.EXPECT_REPLACE_PAIR_OR_END:
				if (c === "{") {
					state = SearchTermsReplacementState.EXPECT_REPLACE_SOURCE;
					replacementSource = "";
				} else if (c === "}") {
					return [replacements, startIndex, index+1];
				} else if (c !== " ") {
					return [[], -1, -1];
				}
				break;

			case SearchTermsReplacementState.EXPECT_REPLACE_SOURCE:
				if (!isEscaped && c === "|") {
					state = SearchTermsReplacementState.EXPECT_REPLACE_RESULT;
					replacementResult = "";
				} else if (!isEscaped && (c === "{" || c === "}")) {
					return [[], -1, -1];
				} else {
					replacementSource += c;
				}
				break;

			case SearchTermsReplacementState.EXPECT_REPLACE_RESULT:
				if (!isEscaped && c === "}") {
					state = SearchTermsReplacementState.EXPECT_REPLACE_PAIR_OR_END;
					replacements.push([replacementSource, replacementResult]);
				} else if (!isEscaped && (c === "|" || c === "}")) {
					return [[], -1, -1];
				} else {
					replacementResult += c;
				}
				break;
		}

		if (isEscaped) {
			isEscaped = false;
		}

		index++;
	}

	return [[], -1, -1];
}

function replace(text: string, replacements: Array<[string, string]>): string
{
	for (let i = 0; i < replacements.length; i++) {
		let [replacementSource, replacementResult] = replacements[i];
		text = text.split(replacementSource).join(replacementResult);	// replace all occurrences
	}
	return text;
}

/* ------------------------------------ */
/* ------------------------------------ */
/* ------------------------------------ */
}