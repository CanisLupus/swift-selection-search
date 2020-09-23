/*

This is the background script for SSS. It's always running. Things it does:

- Injects content scripts (a.k.a. page scripts) into each tab that is opened, to be able to show the engines popup there.
- Registers the search engines to appear on Firefox's context menu.
- Trades messages with the content scripts.
	To initialize them, be informed of search engine clicks to begin searches, among other things.
- Detects changes to settings from the options page and resets all running page scripts to use the new settings.
	Also updates settings objects created on previous SSS versions to contain new settings.

Here you'll find the declarations for most classes and enums related to search engines and settings,
as well as the default settings and engines that come with SSS.

*/

var iconv;	// avoid TS compilation errors but still get working JS code

namespace SSS
{
	/* ==================================== */
	/* ====== Swift Selection Search ====== */
	/* ==================================== */

	// Set to true if you want to see SSS's logs in Firefox's "Browser Console".
	// In general, use for development and don't commit this enabled.
	const DEBUG = false;

	if (DEBUG) {
		var log = console.log;
	}

	// Base class for all engines.
	export abstract class SearchEngine
	{
		[key: string]: any;	// needed to keep legacy variables that are now unused, like iconSrc and id

		type: SearchEngineType;
		isEnabled: boolean;
		isEnabledInContextMenu: boolean;
	}

	// SSS-specific engine base class, for copy to clipboard, open as link, etc.
	// (SearchEngineType: SSS)
	export class SearchEngine_SSS extends SearchEngine
	{
		id: string;
	}

	// SSS-specific engine "copy to clipboard".
	export class SearchEngine_SSS_Copy extends SearchEngine_SSS
	{
		isPlainText: boolean;
	}

	// All custom engines created by the user (or imported from a search.json.mozlz4 file, the old way to import browser engines).
	// (SearchEngineType: Custom or BrowserLegacy)
	export class SearchEngine_Custom extends SearchEngine
	{
		name: string;
		searchUrl: string;
		iconUrl: string;
		encoding: string;
		discardOnOpen: boolean;
	}

	// Search engines imported from the browser via the WebExtensions search API. More limited.
	// (SearchEngineType: BrowserSearchApi)
	export class SearchEngine_BrowserSearchApi extends SearchEngine
	{
		name: string;
		iconUrl: string;
	}

	// (SearchEngineType: Group)
	export class SearchEngine_Group extends SearchEngine_Custom
	{
		groupEngines: Array<any>;
		color: string;
	}

	export class Settings
	{
		// NOTE: When adding new variables, keep the same order used in the settings page, roughly divided by section.

		// Any unspecified settings go here. This is needed to support legacy variables that are now unused, like contextMenuEnginesFilter.
		[key: string]: any;

		useDarkModeInOptionsPage: boolean;

		searchEngineIconsSource: SearchEngineIconsSource;

		popupOpenBehaviour: PopupOpenBehaviour;
		middleMouseSelectionClickMargin: number;
		popupLocation: PopupLocation;
		popupDelay: number;
		minSelectedCharacters: number;
		maxSelectedCharacters: number;
		allowPopupOnEditableFields: boolean;
		hidePopupOnPageScroll: boolean;
		hidePopupOnRightClick: boolean;
		hidePopupOnSearch: boolean;
		useEngineShortcutWithoutPopup: boolean;
		popupOpenCommand: string;
		popupDisableCommand: string;
		mouseLeftButtonBehaviour: OpenResultBehaviour;
		mouseRightButtonBehaviour: OpenResultBehaviour;
		mouseMiddleButtonBehaviour: OpenResultBehaviour;
		shortcutBehaviour: OpenResultBehaviour;
		popupAnimationDuration: number;
		autoCopyToClipboard: AutoCopyToClipboard;
		websiteBlocklist: string;

		showSelectionTextField: boolean;
		selectionTextFieldLocation: SelectionTextFieldLocation;
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
		useCustomPopupCSS: boolean;
		customPopupCSS: string;

		enableEnginesInContextMenu: boolean;
		contextMenuItemBehaviour: OpenResultBehaviour;
		contextMenuItemRightButtonBehaviour: OpenResultBehaviour;
		contextMenuItemMiddleButtonBehaviour: OpenResultBehaviour;
		contextMenuString: string;

		searchEngines: SearchEngine[];
		searchEnginesCache: { [id: string] : string; };

		// sectionsExpansionState: { [id: string] : boolean; };
	}

	export class ActivationSettings
	{
		useEngineShortcutWithoutPopup: boolean;
		popupLocation: PopupLocation;
		popupOpenBehaviour: PopupOpenBehaviour;
		middleMouseSelectionClickMargin: number;
		popupDelay: number;
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
		blockedWebsitesCache: RegExp[];
	}

	export const enum SearchEngineType {
		SSS = "sss",
		Custom = "custom",
		BrowserLegacy = "browser",
		BrowserSearchApi = "browser-search-api",
		Group = "group",
	}

	export const enum SearchEngineIconsSource {
		None = "none",
		FaviconKit = "favicon-kit",
	}

	export const enum PopupOpenBehaviour {
		Off = "off",
		Auto = "auto",
		Keyboard = "keyboard",
		HoldAlt = "hold-alt",
		MiddleMouse = "middle-mouse",
	}

	export const enum PopupLocation {
		Selection = "selection",
		Cursor = "cursor",
	}

	export const enum OpenResultBehaviour {
		ThisTab = "this-tab",
		NewTab = "new-tab",
		NewBgTab = "new-bg-tab",
		NewTabNextToThis = "new-tab-next",
		NewBgTabNextToThis = "new-bg-tab-next",
		NewWindow = "new-window",
		NewBgWindow = "new-bg-window",
	}

	export const enum AutoCopyToClipboard {
		Off = "off",
		Always = "always",
		NonEditableOnly = "non-editable-only",
	}

	export const enum SelectionTextFieldLocation {
		Top = "top",
		Bottom = "bottom",
	}

	export const enum IconAlignment {
		Left = "left",
		Middle = "middle",
		Right = "right",
	}

	export const enum ItemHoverBehaviour {
		Nothing = "nothing",
		Highlight = "highlight",
		HighlightAndMove = "highlight-and-move",
		Scale = "scale",
	}

	// not used anymore but needed for retrocompatibility
	const enum ContextMenuEnginesFilter {
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

	// Default state of all configurable options.
	const defaultSettings: Settings =
	{
		// NOTE: When adding new variables, keep the same order used in the settings page, roughly divided by section.

		useDarkModeInOptionsPage: false,

		searchEngineIconsSource: SearchEngineIconsSource.FaviconKit,

		popupOpenBehaviour: PopupOpenBehaviour.Auto,
		middleMouseSelectionClickMargin: 14,
		popupLocation: PopupLocation.Cursor,
		popupDelay: 0,
		minSelectedCharacters: 0,
		maxSelectedCharacters: 0,
		allowPopupOnEditableFields: false,
		hidePopupOnPageScroll: true,
		hidePopupOnRightClick: true,
		hidePopupOnSearch: true,
		useEngineShortcutWithoutPopup: false,
		popupOpenCommand: "Ctrl+Shift+Space",
		popupDisableCommand: "Ctrl+Shift+U",
		mouseLeftButtonBehaviour: OpenResultBehaviour.ThisTab,
		mouseRightButtonBehaviour: OpenResultBehaviour.ThisTab,
		mouseMiddleButtonBehaviour: OpenResultBehaviour.NewBgTabNextToThis,
		shortcutBehaviour: OpenResultBehaviour.NewBgTabNextToThis,
		popupAnimationDuration: 100,
		autoCopyToClipboard: AutoCopyToClipboard.Off,
		websiteBlocklist: "",

		showSelectionTextField: true,
		selectionTextFieldLocation: SelectionTextFieldLocation.Top,
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
		popupBorderRadius: 4,
		useCustomPopupCSS: false,
		customPopupCSS: "",

		enableEnginesInContextMenu: true,
		contextMenuItemBehaviour: OpenResultBehaviour.NewTabNextToThis,
		contextMenuItemRightButtonBehaviour: OpenResultBehaviour.NewTabNextToThis,
		contextMenuItemMiddleButtonBehaviour: OpenResultBehaviour.NewBgTabNextToThis,
		contextMenuString: "Search for “%s”",
		// sectionsExpansionState: {},

		searchEngines: [

			// special engines (SearchEngine_SSS or a subclass)

			createDefaultEngine({
				type: SearchEngineType.SSS,
				id: "copyToClipboard",
				isPlainText: false,
			}),
			createDefaultEngine({
				type: SearchEngineType.SSS,
				id: "openAsLink",
			}),
			createDefaultEngine({
				type: SearchEngineType.SSS,
				id: "separator",
			}),

			// actual search engines (SearchEngine_Custom)

			createDefaultEngine({
				name: "Google",
				searchUrl: "https://www.google.com/search?q={searchTerms}",
				iconUrl: "https://www.google.com/favicon.ico",
			}),
			createDefaultEngine({
				name: "Bing",
				searchUrl: "https://www.bing.com/search?q={searchTerms}",
				iconUrl: "https://api.faviconkit.com/www.bing.com/64",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "DuckDuckGo",
				searchUrl: "https://duckduckgo.com/?q={searchTerms}",
				iconUrl: "https://api.faviconkit.com/duckduckgo.com/64",
			}),
			createDefaultEngine({
				name: "Yandex.ru",
				searchUrl: "https://yandex.ru/search/?text={searchTerms}",
				iconUrl: "https://api.faviconkit.com/yandex.ru/64",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "Baidu",
				searchUrl: "https://www.baidu.com/s?wd={searchTerms}",
				iconUrl: "https://api.faviconkit.com/www.baidu.com/64",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "YouTube",
				searchUrl: "https://www.youtube.com/results?search_query={searchTerms}",
				iconUrl: "https://www.youtube.com/yts/img/favicon_144-vfliLAfaB.png",
			}),
			createDefaultEngine({
				name: "IMDB",
				searchUrl: "https://www.imdb.com/find?s=all&q={searchTerms}",
				iconUrl: "https://www.imdb.com/favicon.ico",
			}),
			createDefaultEngine({
				name: "Wikipedia (en)",
				searchUrl: "https://en.wikipedia.org/wiki/Special:Search?search={searchTerms}",
				iconUrl: "https://www.wikipedia.org/favicon.ico",
			}),
			createDefaultEngine({
				name: "Amazon.com",
				searchUrl: "https://www.amazon.com/s?url=search-alias%3Daps&field-keywords={searchTerms}",
				iconUrl: "https://api.faviconkit.com/www.amazon.com/64",
			}),
			// createDefaultEngine({
			// 	name: "Amazon.co.uk",
			// 	searchUrl: "https://www.amazon.co.uk/s?url=search-alias%3Daps&field-keywords={searchTerms}",
			// 	iconUrl: "https://api.faviconkit.com/www.amazon.com/64",
			// 	isEnabled: false,
			// }),
			createDefaultEngine({
				name: "eBay.com",
				searchUrl: "https://www.ebay.com/sch/{searchTerms}",
				iconUrl: "https://api.faviconkit.com/www.ebay.com/64",
			}),
			// createDefaultEngine({
			// 	name: "eBay.co.uk",
			// 	searchUrl: "https://www.ebay.co.uk/sch/{searchTerms}",
			// 	iconUrl: "https://api.faviconkit.com/www.ebay.com/64",
			// 	isEnabled: false,
			// }),
			createDefaultEngine({
				name: "Translate to EN",
				searchUrl: "https://translate.google.com/#view=home&op=translate&sl=auto&tl=en&text={searchTerms}",
				iconUrl: "https://translate.google.com/favicon.ico",
			}),
			createDefaultEngine({
				name: "Google Maps",
				searchUrl: "https://www.google.com/maps/search/{searchTerms}",
				iconUrl: "https://api.faviconkit.com/maps.google.com/64",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "(Example) Search current site on Google",
				searchUrl: "https://www.google.com/search?q={searchTerms} site:{hostname}",
				iconUrl: "https://www.google.com/favicon.ico",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "(Example) Open top Steam page",
				searchUrl: "https://www.google.com/search?btnI&q={searchTerms} site:steampowered.com",
				iconUrl: "https://store.steampowered.com/favicon.ico",
				isEnabled: false,
			}),
		],

		// Icon cache for every engine active by default. Other engines' icons will automatically fill this object when they are loaded in the options page.
		searchEnginesCache: {
			"https://www.google.com/favicon.ico"                        : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEHklEQVRYhb2WXWwUVRTH56XBotQn33wQBXlTov3gQWtErKB9IGkptPYBxYox6INRa0LQQELRYqEJ8NAPLMQ0bCuBVqzQZhGpH91YJGYJaYMW0O1XZnb6xc7u7Nxz9u+D203vzGx3tlZPcl723j2///m4d66ieDRd1/OIqIqIWolokJl1ZraSHiaiweRapa7reV7jZjTTNNcRURszx+DRmDlKRCdN01y7ZDCAlUKIBmYmr2AXIUIIcTgUCuVmm/XjzHxzqWAXIUHTNNd4gluW9RQza26BaHwURvsXmHn/bYS3bYZasgHqi0UIl5Vg+r23YJxuBo3+lU6ECmC9l8wdcJoYw+z+j6BuKoT6QsHivqkQs598CJoYcxWRthKTk5P3u5U91tcD7ZXizGCba6XPwbzS59oO15kQQjTYNxtnTmUNXuhz9ftd2yGEqLeXfp192mN9PWkDT9VUItJyDLFvziHWcx6RluOYerNKhh+pAxKJdPMgpFYQUZvU8/FRaC8/6wDr1VsRvxZwDQoA8cEBhHeU4t7xz9PuSTGIWhVFURQAD9ovmUjjOw749J7XkJibyxg4YUQy7gEAZjY0TVulEFGVFCA6AtG7ArO1j6Tg4W2bwTNTngJnY0S0XSGiVknZnToIfw6EPwfGsYegbclH7NKFZYcnBTQpRDQo/fhrSUqA8Ocgfm41IMR/JSCgMLO+8EfR/7AkgG5ULhpk48GIZ79yU06EmVWFmS1JwOUVkgD+Y9+yCWj/SUKBmeP/q4C2q3FXAWFJgL0FwR3LJqAz4KiA6hzC6y9JAkb7n4DF2Q/hbZUdAq4OyXGIKOByDD9NwS/0rMYzvq3oGvFnLcA3YDkETMzIV/P8MZTGPBG9g6g/F3VdTyPfV4Z8XxlKul5HODbtGX4vlkB5oyHBdzZFHfuIqELRdT2PmaXVowMHUvB5r+79ADPxzFexRUDtmZgj+w5n/w0AD8x/jE4uXByPqCg++6pDROnXu9E/di0t/Nb0Xezq9mHjwVkJXt5oIBp3lL954ed4LbM8aRfv9jsEzHv5t++i4XobOm9dxFe/X8KJYDve8O9Fga8c+b4yFJ2qxfOfhVICfhiW37XMbJmm+Zj9QXLYntGXw91pRWTygvadKD7yi+PsA4AQ4pDjRQRgJTPfsG/u/fNHFJ+tzlpAUUcFWoLdDjgz/wbgvnSP0jXJ16tkE4aGvT8fRWFHuSf47u8+xtDUiBt8EsCjrvAFlVjvJgL4ZzhPD53Hnu8PYEt3DTZ0VqCoowIlXbtQc3kfTgTbMTx12+2vYOZJy7KeXBRuq0TQNdISLFn2xTO3WygUyhVC1NtPR5ZgSwhxCOl67rUaRNSavDi8gg0ianYctX9jmqatIqLtRNRERAFmVpk5nnSViALJtQrM33Ae7G92y3s6IRzKLQAAAABJRU5ErkJggg==",
			"https://api.faviconkit.com/duckduckgo.com/64"              : "data:image/png;base64,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",
			"https://www.youtube.com/yts/img/favicon_144-vfliLAfaB.png" : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAA0klEQVRoge2YwQ2EIBREfwmUYCmWYCmWsB1YgqVQEiXMXiDxgCskCEx2XjJHdR75UcFMCCGEqABmDmYrzD4x/hIU5npNus8KM9eyaGmZLqkpXrOSveOfyh8TlHzKQTM2VeMEs210sYpsOYEwQbHSBNrxSZHA6LwnAAAhkAsk9p1cIOEcuUCCXgAAzpNcILEsEtAIVQu0ekZ3AdrXKO2HjPpXolMkMDo5AfotJfemnmmMsuWjAPfBVpTwE5S8i/9ZfuZxKi5eKPfK8XrTkkIIIf6CLwP44M2GNwfzAAAAAElFTkSuQmCC",
			"https://www.imdb.com/favicon.ico"                          : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAE20lEQVRogdWVyW+TVxTFL0hGLKh1LVVCCtgk7226qdRFV911A5VA6qJAQklLNyUQoFIRkxgKAcQkiELiKAlx4ozEGezEsePY2NgJBAJpQqJMTQhVW3VUp3/hdFH5q5/fF7LtW/wWPu/e8875ZH+mZz0Mk6HxbsbfS9JIxrsZ9DTA+OsbaSRPAwx60sX4c0EayZMuBo11Mv6Yk0Yy1smgxx2M32elkTzuYNBoO+O3GWkko+0MGmlj/DotjWSkjUEjLYxfpqSRjLQwKONn/DwpjSTjZ1C6mfHThDSSdDOD0k2MH59LI0k3MSjlY/wwLo0k5WNQspHx/VNpJMlGBj1oYHw3Jo3kQQOD4vWMbx9JI4nXM2i4jvFqVFpMRoogPA6L/R868WpUwluxWdFzz16NSu1MeByr6sLjwBefuZBo91j7+f7eis1KLjuG6xg0XMtYyUiLRKsHRGRR5HZgJSNx7IBL0YkIGxzrsJKRmE8I7YyIsJKRtnouxw64bP2z+usYrmVQzMt4mZYW8Ra9wMu0fQEist3JPVurQHbOrkDW++twkZIxS8zLoKEaxnJKWgz79QLLKYmjn9oXGPZ7Vj1bTukFllMSGxzr1vR49+2NypzzjfVKzuWUxFANg4aqGUtJaRFr1gssJSWOfmIf8u6Fzdj5/ibbs6WkXmApKVHkdiharNmzqn8uXx17U8k6VM2gyF3GYkJaRH15BbY6sJiQOFKqXuDctB5EhCOlLhRtdShalsWEXmAxIa35LFGfR/Mv2eVEyS6noh0pdSlZI3cZNFjFWIhLi2ijXmAhLlGed0E2RG6Y/GALcb3AQtymQKNH8y8vddlquVkHqxgUrmTMx6RFpEEtULjVgfmYRPl+1ax4579PJ/d7mtWyzMf0AvMxicK8ApEGj+Zfvt9lq+VmDVcyaOAOYy4qLQbr9QJzUYnDH6tm+Z/ttLmoXmAuqhcYrPfY+ttpuVkH7jCo/zZjNiIswnVutcAWB2YjAof3qWb+6wXabyJ/Zjai/z/MRgQKt6gFwnVubffwPpetlpu1/zaDQrcYM2Fh0V+rF5gJCxwqUc3s5vJnZsJ6gZmwXqC/1q3tHipx2Wq5WUO3GBS8yZgeEBb9Xj3Y9IBAWZ7Z9IAabs8HzjVnsppWwOvWdstKXLZabtbgTQb13WC8CAmLUI1e4EVIoKxYNXsRUsOVFbvWnMlq+a/bUI1b27XzKyt2KVn7bjCo9zpjKigsgtVqgW0FDkwFBQ7uVc2mggLbCv57ksFqt+1MfoH88ESETGuhtrt7hxO7d6hvtYN7XUrW3usM6rnGmOwVFn1VeoHJXoGDe9QLJnvVAn1VbtuZ/LB22Pnbca+iQMnac41BgauMiW5h0VOpF5joFvh8t3pBvrbazOsCvfPWRqSaCm13P9ruVP5jtr+3Sck50S0QuMqgwBXG84D439Jd6UbSV2h7FrjCoK7LjGddwki6LjPofgVjvFMYyf0KBnVeYjxpF0bSeYlBHRcZY23CSDouMqj9AuNxizCS9gsMajvPeOQXRtJ2nkGt5xijTcJIWs8xqOUsY8QnjKTlLIP8Zxjpe8JI/GcY1Hya8bBeGEnzaQY1nWKk6oSRNJ1ikO8kI1krjMR3kkGNJxgPvMJIGk8wqOE4I14tjKThOIPqv2SYzD/ZLZPkdY1wuAAAAABJRU5ErkJggg==",
			"https://www.wikipedia.org/favicon.ico"                     : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAADH0lEQVRoge1Z7Y3sIAwkVdAGXdACHaQDWkgFFJEKUgIl0AJV4PdrIuAIOMmusnvvTrJ00jrB4xl/oAjR+Usp0SdYL8aPDfoSmKeDuwXi6aBugXg6mNsgng7k/wbwdBC3QTwdwB+ApwP4A4B/tNaklCKlFGmtyRhTWP67tZZSSmx/7z2t63roD9/Re+FnjPkJwHtP1lpSStE0TU2TUtKyLOS9p5QSbdtG8zwXPkIIEkLQNE00zzOt60opJQohkHOOtNY//LXW5JyjEMLhe/Pz4deUUIyRrLV7EPnDMcYmjeu6kpSyeGZZlqZvCKFIknPuUB7Lsux+Wuvm+c0aiDGSMaYAkNPWMmttwQDk0Hu3tfYwKUgMkpdnnVXE27YVWVVKdQ/z3heZPWLMe09SSlJKHQYFc86REOKQzS6AGCPN87xnVAhB27axWOjJY1kWEkLstdE7H0WLmjsFoNa2EIKUUt1DoW+wVrOA7B/puVZAT4osAMhCzkIvGy0WcvrRWTjZN8aQlHLI+nCQOeeKgLTWQxaklHtBgwXvPasZgCmu7xBAjHGXBWxUfHUPt9ayM4o64TDFApDLAgBGmQELeS1gsHEShi7FiY0FIJcFbFSExphisPV6eUuyvQF3GgACygGMshlCKNaF3iTPDdnn+J4CgBbIWS2OQI9a4rquw8F1GUBKaZ+0kMbooLqYR9NXa81m6hKAbdsKWfQKLZcQhwXvPQkhWIV+GQA0msvoqNggHyxk+RxpsQB/TqHfAoAFC9YabBhEyCY60pH0wBZncN0GkLOA7lIPnFrLdUeqawG1cjb7lwFgo2zdFdBJamnVHQm/Y3CNVpSXAsChkIWUcl/ysALXnQSyyjtSjHFfG0ZL4ksBpJSKayd6N6Zoa4fB/aJmARf4q3FcBhBCKIpZSjnc9fM2jC7Gudy8BUDr3jxNU3fbxDM58DNrw0sBtHTNGUL1XOAubW8BgBsb5MDZ9XPmuBvq2wAgo5y7a24o9jPPvA1ACIGstafaIDrS1db5UgBP21d/pfkd38h+BYBvBNH6WP81IJrBfwuIbvCfCqYX4z8UwrBWOPp89wAAAABJRU5ErkJggg==",
			"https://api.faviconkit.com/www.amazon.com/64"              : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAEq0lEQVRogc1aQWvjRhQWWPoFPq6V00LZQ8HJrZcUEvu0lwSkubfQ5J6Cf8Cy9XkXKws9hQiKfVh3nb000Mop5BTvmN1LqNVC20MjqGGxkbuFzWG/HsbjleSZsSXHdh884jh60vfNfO/NG2U0TWAAHgI4AfAa6zcK4FsAZRHWJPBPAVytF6/SLgHcl4F/CGC0ZoDz2BDA50nwRQD/LnJX3/dRcxzYhMAmBDldh24Y0A0Du+UybEJQcxxQSu+KxCccfA4LaN05PkZxcxO6YSA3dl3gucjP4uYmWmdni5K45ASsLNG+70+A6wLgMiJRt2wbYRguQmJHA9DIAv6eaaYCK5uRUrmM0Shz6j3TALxNExEEAQobG6kBx8DrekxuNcfJSuB3LW1EpVJZCLzI75lmVgLvUxEIgkCdoLo+SVBKKSilqDkOChG5yTxrdUpF4PT0VEmgUqkI43zfF5KI5k5WGaUiYBEiBJEzDBRMU5mMlUpFmewrIVA7PpYCODg8VMc6jrJqyWbvTglwG41GMY3XHAe+7ytj2u22sqTahKyOQBajlMZWY570nMT/hoDv+7GZsca9UXTVFvnaCARBANd1Ydl29oVtHQTCMBQuaqpmTlWFVkqAUhrrheYhMYuYZdurISCrJqrRtQjBbqmkvH4lBIIgQME0hXJIVhTP82ILW7fbVc7MSiQka+Q4iIJpwvM8YWy3211vFQrDcDLyMrm4riuNrzmOdNOzkirUOjtTJm1hRkscJSAaAGvZBKK9TBYJzNpHLH0Gvjo4UI/gjCqy9pXYHrfSye0g91K5LI190WrNXI11w8DNzc3yCHxTrSofnjPEu6owDGfuyPhgPK5Wl0dgVg7wMholQSmdks6sliLt1nJuAr7vzyUDTkRWLkXfR724tbUcAgBib+BkMkjjopi0byhSEfA8by7wMpm4rovi1pb0ut1SKfWbutTNXDKZZT1RFFzBNPGi1QIgl+LB4WGm14yZ2mnXdZWVJUrKIgRBEMTik2U164Y+MwGAbexd14VFyGRvwFsKmxA8rlbR6/Wk8e12GzYhyv4Jf3eY9zvAP+I1Ik5g2AP+/D4ToTuz/ivg8kugrjFvjL2uMXwJixMY9NjF7T3gXfpVcWEb9BjQi33g8gvg+gnQOfpIpv9qKmRaQn/9CDTzjMjVkXTqVmoX+4zAu2DqT+IcGPYYCc58lURuQzbyzTybBYB9buaFl8uTeNADzrcnJD7Ux9L6o8kectd281NcLg2NPYvLqvO1KOq9BqAvveltyG7KkyiaVBd7wPVToS7nskGPAbw6App5NkD8/s08IwQAv56w78QK+E0D8N3Mh/G8qGvxGWlEHvryASP15hEjdv0k4U+ZJNp7QCMRH/3c3otr/WKfxYvtmQZgf64Ruw0ZiOf5j7MQ9boATOLvH5KzGL325QNxCVfn3g7/T+X8PSxPsuf5acB1BeDkddzPt7OuPV7yiMEw9S144jXzUzMxBT76+/k2GwTBwjSn9ZE8cgBgB4scNRj8wnKF671zxPT8epwT/glL+MUr2FsAn8nOS9wH8POiT1ii/QBgY55TK2WwIy4U6z0AMhxjqCF5wGNs/wEm1A75lp2QYwAAAABJRU5ErkJggg==",
			"https://api.faviconkit.com/www.ebay.com/64"                : "data:image/png;base64,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",
			"https://translate.google.com/favicon.ico"                  : "data:image/png;base64,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",
		}
	};

	if (DEBUG) { log("Startup time is: " + new Date().toLocaleString()); }

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

		// Clear all settings (for test purposes only).
		// Since the mistake from version 3.43.0, "removeToUse" was added to the call
		// and the add-on submission script (not included in the repository) now
		// checks for calls to the clear() function.

		// browser.storage.local.cle_removeToUse_ar();
		// browser.storage.sync.cle_removeToUse_ar();

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
		sss.blockedWebsitesCache = buildBlockedWebsitesCache(settings.websiteBlocklist);

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
		activationSettings.useEngineShortcutWithoutPopup = settings.useEngineShortcutWithoutPopup;
		activationSettings.popupLocation = settings.popupLocation;
		activationSettings.popupOpenBehaviour = settings.popupOpenBehaviour;
		activationSettings.middleMouseSelectionClickMargin = settings.middleMouseSelectionClickMargin;
		activationSettings.popupDelay = settings.popupDelay;
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

	// Builds an array of regular expressions based on the websites in the blocklist.
	// This makes it easier to just match the regex and a part of the URL later.
	function buildBlockedWebsitesCache(websitesBlocklistText: string): RegExp[]
	{
		websitesBlocklistText = websitesBlocklistText.trim();

		let websites: string[] = websitesBlocklistText.split("\n");
		let websiteRegexes: RegExp[] = [];

		for (let i = 0; i < websites.length; i++)
		{
			let website: string = websites[i].trim();
			if (website.length == 0) continue;

			let regexStr: string;

			if (website.startsWith("/") && website.endsWith("/"))
			{
				regexStr = website.substr(1, website.length-2);	// string without the / /
			}
			else if (website.includes("*"))
			{
				regexStr = escapeRegexString(website);
				regexStr = "^" + regexStr.replace("\\*", "(.*?)");	// ^ matches start of string, * are replaced by a non greedy match for "any characters"
			}
			else
			{
				regexStr = "^" + escapeRegexString(website);	// ^ matches start of string
			}

			try {
				let regex = new RegExp(regexStr);
				websiteRegexes.push(regex);
			} catch (e) {
				console.warn("[WARNING] [Swift Selection Search]\nRegex parse error in \"Website blocklist\". Problematic regex is:\n\n\t" + website + "\n\n" + e);
			}
		}

		return websiteRegexes;
	}

	function escapeRegexString(str: string): string
	{
		return str.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched str
	}

	// Adds settings that were not available in older versions of SSS to the settings object.
	// For simplicity, all other code in SSS assumes that all settings exist and have a value.
	// This method ensures it, regardless of what SSS version the user last changed settings at.
	function runBackwardsCompatibilityUpdates(settings: Settings): boolean
	{
		let shouldSave: boolean = false;

		// in the comments you can see the first version of SSS where the setting was included
		if (createSettingIfNonExistent(settings, "popupItemVerticalPadding"))             shouldSave = true; // 3.1.0
		if (createSettingIfNonExistent(settings, "allowPopupOnEditableFields"))           shouldSave = true; // 3.6.0
		if (createSettingIfNonExistent(settings, "popupBorderRadius"))                    shouldSave = true; // 3.9.1
		if (createSettingIfNonExistent(settings, "popupItemBorderRadius"))                shouldSave = true; // 3.12.0
		if (createSettingIfNonExistent(settings, "minSelectedCharacters"))                shouldSave = true; // 3.13.0
		if (createSettingIfNonExistent(settings, "middleMouseSelectionClickMargin"))      shouldSave = true; // 3.14.1
		if (createSettingIfNonExistent(settings, "hidePopupOnRightClick"))                shouldSave = true; // 3.15.0
		if (createSettingIfNonExistent(settings, "popupSeparatorWidth"))                  shouldSave = true; // 3.21.0
		if (createSettingIfNonExistent(settings, "popupOpenCommand"))                     shouldSave = true; // 3.22.0
		if (createSettingIfNonExistent(settings, "popupDisableCommand"))                  shouldSave = true; // 3.22.0
		if (createSettingIfNonExistent(settings, "iconAlignmentInGrid"))                  shouldSave = true; // 3.25.0
		if (createSettingIfNonExistent(settings, "popupDelay"))                           shouldSave = true; // 3.29.0
		if (createSettingIfNonExistent(settings, "maxSelectedCharacters"))                shouldSave = true; // 3.30.0
		if (createSettingIfNonExistent(settings, "contextMenuString"))                    shouldSave = true; // 3.32.0
		if (createSettingIfNonExistent(settings, "showSelectionTextField"))               shouldSave = true; // 3.40.0
		if (createSettingIfNonExistent(settings, "useCustomPopupCSS"))                    shouldSave = true; // 3.40.0
		if (createSettingIfNonExistent(settings, "customPopupCSS"))                       shouldSave = true; // 3.40.0
		if (createSettingIfNonExistent(settings, "selectionTextFieldLocation"))           shouldSave = true; // 3.41.0
		if (createSettingIfNonExistent(settings, "websiteBlocklist"))                     shouldSave = true; // 3.42.0
		if (createSettingIfNonExistent(settings, "useDarkModeInOptionsPage"))             shouldSave = true; // 3.43.0
		if (createSettingIfNonExistent(settings, "mouseRightButtonBehaviour"))            shouldSave = true; // 3.43.0
		if (createSettingIfNonExistent(settings, "contextMenuItemRightButtonBehaviour"))  shouldSave = true; // 3.43.0
		if (createSettingIfNonExistent(settings, "contextMenuItemMiddleButtonBehaviour")) shouldSave = true; // 3.43.0
		if (createSettingIfNonExistent(settings, "searchEngineIconsSource"))              shouldSave = true; // 3.44.0
		if (createSettingIfNonExistent(settings, "shortcutBehaviour"))                    shouldSave = true; // 3.46.0
		if (createSettingIfNonExistent(settings, "useEngineShortcutWithoutPopup"))        shouldSave = true; // 3.46.0

		// 3.7.0
		// convert old unchangeable browser-imported engines to normal ones
		for (let engine of settings.searchEngines)
		{
			if (engine.iconUrl === undefined && engine.type === SearchEngineType.BrowserLegacy) {
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
	function onSettingsChanged(changes: object, area: string)
	{
		if (area !== "local" || isObjectEmpty(changes)) {
			return;
		}

		if (DEBUG) { log("onSettingsChanged in " + area); }
		if (DEBUG) { log(changes); }

		browser.storage.local.get()
			.then(onSettingsAcquired, getErrorHandler("Error getting settings after onSettingsChanged."))
			.then(updateSettingsOnAllTabs, getErrorHandler("Error updating settings on all tabs."));
	}

	function updateSettingsOnAllTabs()
	{
		browser.tabs.query({}).then(tabs => {
			for (const tab of tabs) {
				activateTab(tab);
			}
		}, getErrorHandler("Error querying tabs."));
	}

	function activateTab(tab: browser.tabs.Tab)
	{
		browser.tabs.sendMessage(tab.id, {
			type: "activate",
			activationSettings: sss.activationSettingsForContentScript,
			isPageBlocked: isPageBlocked(tab),
		}).then(() => {}, () => {});	// suppress errors
	}

	function isPageBlocked(tab: browser.tabs.Tab): boolean
	{
		if (sss.blockedWebsitesCache === undefined) return false;	// can happen when reloading extension in about:debugging
		if (sss.blockedWebsitesCache.length == 0) return false;
		if (!tab.url) return false;	// tab.url is undefined if we don't have the "tabs" permission

		let index = tab.url.indexOf("://");	// NOTE: assumes the URL does NOT contain :// at an index much after the protocol
		let url: string = index >= 0 ? tab.url.substr(index + 3) : tab.url;

		for (const regex of sss.blockedWebsitesCache)
		{
			if (url.match(regex)) {
				if (DEBUG) { log("regex " + regex + " matches this URL. BLOCKED " + url); }
				return true;
			}
		}

		return false;
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

			case "getPopupSettings":
				callbackFunc(sss.settingsForContentScript);
				break;

			case "engineClick":
				onSearchEngineClick(msg.engine, msg.clickType, msg.selection, msg.href);
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
		if (engine.type === undefined) {
			engine.type = SearchEngineType.Custom;
		}

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

		if (sss.settings.enableEnginesInContextMenu !== true) return;

		// define parent menu
		browser.contextMenus.create({
			id: "sss",
			title: sss.settings.contextMenuString,
			contexts: ["selection"], // "link"],
			// The code in onContextMenuItemClicked already allows SSS to search by a link's text by right clicking it,
			// so uncommenting the above "link" context would magically add this feature. However, by default, SSS's
			// contextMenuString uses %s, which Firefox replaces ONLY with the currently selected text, MEANING that if you just
			// right click a link with nothing selected, the context menu would just say [Search for “%s”] with a literal %s.
			// Since this feels dumb, the feature is commented-out for now.
		});

		let engines: SearchEngine[] = sss.settings.searchEngines;

		// define sub options (one per engine)
		for (let i = 0; i < engines.length; i++)
		{
			const engine = engines[i];
			if (!engine.isEnabledInContextMenu) continue;

			let contextMenuOption = {
				id: undefined,
				title: undefined,
				type: undefined,
				parentId: "sss",
				icons: undefined,
			};

			if (engine.type === SearchEngineType.SSS) {
				let concreteEngine = engine as SearchEngine_SSS;
				if (concreteEngine.id === "separator") {
					contextMenuOption.type = "separator";
					browser.contextMenus.create(contextMenuOption);
					continue;
				}
				contextMenuOption.title = sssIcons[concreteEngine.id].name;
			} else {
				let concreteEngine = engine as SearchEngine_Custom;
				contextMenuOption.title = concreteEngine.name;
			}

			let icon;
			if (engine.type === SearchEngineType.SSS) {
				let concreteEngine = engine as SearchEngine_SSS;
				icon = sssIcons[concreteEngine.id].iconPath;
			}
			else {
				let iconUrl: string;

				if (engine.type === SearchEngineType.Custom || engine.type === SearchEngineType.BrowserLegacy) {
					iconUrl = (engine as SearchEngine_Custom).iconUrl;
				} else { // engine.type === SearchEngineType.BrowserSearchApi
					iconUrl = (engine as SearchEngine_BrowserSearchApi).iconUrl;
				}

				if (iconUrl.startsWith("data:")) {
					icon = iconUrl;
				} else {
					icon = sss.settings.searchEnginesCache[iconUrl];
					if (icon === undefined) {
						icon = iconUrl;
					}
				}
			}

			contextMenuOption.icons = { "32": icon };

			contextMenuOption.id = "" + i;
			browser.contextMenus.create(contextMenuOption);
		}

		browser.contextMenus.onClicked.addListener(onContextMenuItemClicked);
	}

	function onContextMenuItemClicked(info: browser.contextMenus.OnClickData, tab: browser.tabs.Tab)
	{
		let menuId: number = parseInt(info.menuItemId as string);
		let engines: SearchEngine[] = sss.settings.searchEngines;
		let selectedEngine: SearchEngine = engines[menuId];

		let button = info?.button ?? 0;
		let url: string = null;
		let discardOnOpen: boolean;

		// check if it's a special SSS engine
		if (selectedEngine.type === SearchEngineType.SSS)
		{
			let engine_SSS = selectedEngine as SearchEngine_SSS;

			if (engine_SSS.id === "copyToClipboard")
			{
				if (info.selectionText) {
					copyToClipboard(selectedEngine as SearchEngine_SSS_Copy);	// copy in the page script, to allow choice between HTML and plain text copy
				} else if (info.linkText) {
					navigator.clipboard.writeText(info.linkText);	// if copying a link, just always copy its text
				}
			}
			else if (engine_SSS.id === "openAsLink")
			{
				url = getOpenAsLinkSearchUrl(info.selectionText || info.linkText);
				discardOnOpen = false;
			}
		}
		// check if it's a browser-managed engine (BrowserSearchApi)
		else if (selectedEngine.type === SearchEngineType.BrowserSearchApi)
		{
			searchUsingSearchApi(
				selectedEngine as SearchEngine_BrowserSearchApi,
				info.selectionText || info.linkText,
				getOpenResultBehaviourForContextMenu(button)
			);
		}
		// otherwise it's a normal search engine (type Custom or BrowserLegacy), so run the search
		else
		{
			// search using the engine
			let engine_Custom = selectedEngine as SearchEngine_Custom;
			url = getSearchQuery(engine_Custom, info.selectionText || info.linkText, new URL(info.pageUrl));
			discardOnOpen = engine_Custom.discardOnOpen;
		}

		if (url !== null)
		{
			openUrl(url, getOpenResultBehaviourForContextMenu(button), discardOnOpen);
		}
	}

	function getOpenResultBehaviourForContextMenu(button: number)
	{
		if (button === 0) return sss.settings.contextMenuItemBehaviour;
		if (button === 1) return sss.settings.contextMenuItemMiddleButtonBehaviour;
		/* if (button === 2)  */return sss.settings.contextMenuItemRightButtonBehaviour;
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

		// If the user has set the option to always use the engine shortcuts, we inject the script
		// even if the opening behaviour of the popup is set to Off (never).
		if (sss.settings.popupOpenBehaviour !== PopupOpenBehaviour.Off || sss.settings.useEngineShortcutWithoutPopup) {
			// register page load event and try to add the content script to all open pages
			browser.webNavigation.onDOMContentLoaded.addListener(onDOMContentLoaded);
			browser.tabs.query({}).then(installOnOpenTabs, getErrorHandler("Error querying tabs."));
		}

		if (browser.webRequest)
		{
			registerCSPModification();
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
				browser.tabs.executeScript(tabId, executeScriptOptions)
					.then(() => getTabWithId(tabId, tab => activateTab(tab)), errorHandler)
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

	/* ------------------------------------ */
	/* ------- HEADER MODIFICATION -------- */
	/* ------------------------------------ */

	// Some pages have a restrictive CSP that blocks things, but extensions can modify the CSP to allow their own modifications
	// (as long as they have the needed permissions). In particular, SSS needs to use inline style blocks.
	function registerCSPModification()
	{
		browser.webRequest.onHeadersReceived.removeListener(modifyCSPRequest);

		if (DEBUG) { log("registering with onHeadersReceived"); }

		browser.webRequest.onHeadersReceived.addListener(
			modifyCSPRequest,
			{ urls : [ 'http://*/*', 'https://*/*' ], types: [ 'main_frame' ] },
			[ 'blocking', 'responseHeaders' ]
		);
	}

	function modifyCSPRequest(details)
	{
		for (const responseHeader of details.responseHeaders)
		{
			const headerName = responseHeader.name.toLowerCase();
			if (headerName !== 'content-security-policy' && headerName !== 'x-webkit-csp') continue;

			const CSP_SOURCE = "style-src";

			if (responseHeader.value.includes(CSP_SOURCE))
			{
				if (DEBUG) { log("CSP is: " + responseHeader.value); }
				responseHeader.value = responseHeader.value.replace(CSP_SOURCE, CSP_SOURCE + " 'unsafe-inline'");
				if (DEBUG) { log("modified CSP to include style-src 'unsafe-inline'"); }
			}
		}

		return details;
	}

	/* ------------------------------------ */
	/* ---------- ENGINE CLICKS ----------- */
	/* ------------------------------------ */

	function onSearchEngineClick(selectedEngine: SearchEngine, clickType: string, searchText: string, href: string)
	{
		let url: string = null;
		let discardOnOpen: boolean;

		// check if it's a special SSS engine
		if (selectedEngine.type === SearchEngineType.SSS)
		{
			let engine_SSS = selectedEngine as SearchEngine_SSS;

			if (engine_SSS.id === "copyToClipboard") {
				copyToClipboard(engine_SSS as SearchEngine_SSS_Copy);
			}
			else if (engine_SSS.id === "openAsLink") {
				url = getOpenAsLinkSearchUrl(searchText);
				discardOnOpen = false;
				if (DEBUG) { log("open as link: " + url); }
			}
		}
		// check if it's a browser-managed engine (BrowserSearchApi)
		else if (selectedEngine.type === SearchEngineType.BrowserSearchApi)
		{
			searchUsingSearchApi(
				selectedEngine as SearchEngine_BrowserSearchApi,
				cleanSearchText(searchText),
				getOpenResultBehaviour(clickType)
			);
		}
		// otherwise it's a normal search engine (type Custom or BrowserLegacy), so run the search
		else
		{
			let engine_Custom = selectedEngine as SearchEngine_Custom;
			url = getSearchQuery(engine_Custom, searchText, new URL(href));
			discardOnOpen = engine_Custom.discardOnOpen;
		}

		if (url !== null)
		{
			openUrl(url, getOpenResultBehaviour(clickType), discardOnOpen);
		}
	}

	function getOpenResultBehaviour(clickType: string)
	{
		if (clickType === "leftClick")     return sss.settings.mouseLeftButtonBehaviour;
		if (clickType === "middleClick")   return sss.settings.mouseMiddleButtonBehaviour;
		if (clickType === "rightClick")    return sss.settings.mouseRightButtonBehaviour;
		if (clickType === "shortcutClick") return sss.settings.shortcutBehaviour;
		if (clickType === "ctrlClick")     return OpenResultBehaviour.NewBgTab;
		return OpenResultBehaviour.NewBgTab;	// shouldn't happen
	}

	function copyToClipboard(engine: SearchEngine_SSS_Copy)
	{
		if (engine.isPlainText) {
			copyToClipboardAsPlainText();
		} else {
			copyToClipboardAsHtml();
		}
	}

	function copyToClipboardAsHtml()
	{
		getCurrentTab(tab => browser.tabs.sendMessage(tab.id, { type: "copyToClipboardAsHtml" }));
	}

	function copyToClipboardAsPlainText()
	{
		getCurrentTab(tab => browser.tabs.sendMessage(tab.id, { type: "copyToClipboardAsPlainText" }));
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

	function cleanSearchText(searchText: string): string
	{
		return searchText.trim().replace("\r\n", " ").replace("\n", " ");
	}

	// gets the complete search URL by applying the selected text to the engine's own searchUrl
	function getSearchQuery(engine: SearchEngine_Custom, searchText: string, url: URL): string
	{
		searchText = cleanSearchText(searchText);

		let hasCustomEncoding = engine.encoding && engine.encoding !== "utf8";
		if (hasCustomEncoding) {
			// encode to bytes, then convert bytes to hex and add % before each pair of characters (so it can be used in the URL)
			let buffer = iconv.encode(searchText, engine.encoding);
			searchText = "%" + buffer.toString('hex').toUpperCase().replace(/([A-Z0-9]{2})\B/g, '$1%');
		}

		let query = engine.searchUrl;

		// https://developer.mozilla.org/en-US/docs/Web/API/URL#Properties
		// NOTE: regex "i" flag ignores case
		if (/\{hash/i.test(query))     { query = SearchVariables.modifySearchVariable(query, "hash",     url.hash,     false); }
		if (/\{hostname/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "hostname", url.hostname, false); }	// must be replaced before "host"
		if (/\{host/i.test(query))     { query = SearchVariables.modifySearchVariable(query, "host",     url.host,     false); }
		if (/\{href/i.test(query))     { query = SearchVariables.modifySearchVariable(query, "href",     url.href,     false); }
		if (/\{origin/i.test(query))   { query = SearchVariables.modifySearchVariable(query, "origin",   url.origin,   false); }
		if (/\{password/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "password", url.password, false); }
		if (/\{pathname/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "pathname", url.pathname, false); }
		if (/\{port/i.test(query))     { query = SearchVariables.modifySearchVariable(query, "port",     url.port,     false); }
		if (/\{protocol/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "protocol", url.protocol, false); }
		if (/\{search/i.test(query))   { query = SearchVariables.modifySearchVariable(query, "search",   url.search,   false); }
		if (/\{username/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "username", url.username, false); }

		query = SearchVariables.modifySearchVariable(query, "searchTerms", searchText, !hasCustomEncoding);

		return query;
	}

	function openUrl(urlToOpen: string, openingBehaviour: OpenResultBehaviour, discardOnOpen: boolean)
	{
		getCurrentTab(tab => {
			const lastTabIndex: number = 9999;	// "guarantees" tab opens as last for some behaviours
			let options = { url: urlToOpen };

			if (openingBehaviour !== OpenResultBehaviour.NewWindow && openingBehaviour !== OpenResultBehaviour.NewBgWindow) {
				options["openerTabId"] = tab.id;
			}

			if (discardOnOpen) {
				// to be able to discard we need to open the URL in a new tab, regardless of opening behaviour choice
				openingBehaviour = OpenResultBehaviour.NewTabNextToThis;
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
					let promise = browser.tabs.create(options);
					// NOTE: we actually wanted to do this in a new BACKGROUND tab, to avoid the flickering when opening a new tab and then deleting it.
					// However, tabs opened in the background take time to actually process the URL, so we'd have to use a timer before
					// removing the tab and we don't even know how much time this will take.
					if (discardOnOpen) {
						promise.then(tab => browser.tabs.remove(tab.id));
					}
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
					// options["focused"] = false;	// fails because it's unsupported by Firefox
					browser.windows.create(options);
					break;
			}
		});
	}

	function searchUsingSearchApi(engine: SearchEngine_BrowserSearchApi, searchText: string, openingBehaviour: OpenResultBehaviour)
	{
		getCurrentTab((tab: browser.tabs.Tab) => {
			browser.search.search({
				engine: engine.name,
				query: cleanSearchText(searchText),
				// we want all open behaviours that are not "ThisTab" to open in another tab
				tabId: openingBehaviour === OpenResultBehaviour.ThisTab ? tab.id : undefined
			});
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

	function getTabWithId(tabId, callback)
	{
		// get the specified tab and run a function on it
		browser.tabs.get(tabId).then(
			tab => callback(tab),
			getErrorHandler("Error getting tab.")
		);
	}
}
