var iconv;	// avoid TS compilation errors but still get working JS code

namespace SSS
{
	/* ==================================== */
	/* ====== Swift Selection Search ====== */
	/* ==================================== */

	const DEBUG = true;
	if (DEBUG) {
		var log = console.log;
	}

	export abstract class SearchEngine
	{
		[key: string]: any;	// needed to keep old variables like iconSrc and id

		type: SearchEngineType;
		isEnabled: boolean;
		isEnabledInContextMenu: boolean;
	}

	export class SearchEngine_SSS extends SearchEngine
	{
		id: string;
	}

	export class SearchEngine_SSS_Copy extends SearchEngine_SSS
	{
		isPlainText: boolean;
	}

	export class SearchEngine_Custom extends SearchEngine
	{
		name: string;
		searchUrl: string;
		iconUrl: string;
		encoding: string;
	}

	export class SearchEngine_Browser extends SearchEngine_Custom
	{
	}

	export class Settings
	{
		[key: string]: any;	// needed to keep old variables like contextMenuEnginesFilter

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
		popupOpenCommand: string;
		popupDisableCommand: string;
		mouseLeftButtonBehaviour: OpenResultBehaviour;
		mouseMiddleButtonBehaviour: OpenResultBehaviour;
		popupAnimationDuration: number;
		autoCopyToClipboard: AutoCopyToClipboard;

		showSelectionTextField: boolean;
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
		contextMenuString: string;
		searchEngines: SearchEngine[];
		searchEnginesCache: { [id: string] : string; };
		// sectionsExpansionState: { [id: string] : boolean; };
	}

	export class ActivationSettings
	{
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
		Scale = "scale",
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
		popupDelay: 0,
		minSelectedCharacters: 0,
		maxSelectedCharacters: 0,
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

		showSelectionTextField: true,
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
		contextMenuItemBehaviour: OpenResultBehaviour.NewBgTab,
		contextMenuString: "Search for “%s”",
		// sectionsExpansionState: {},

		searchEngines: [

			// special engines

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
				searchUrl: "https://www.imdb.com/find?s=all&q={searchTerms}",
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
				name: "Amazon.com",
				searchUrl: "https://www.amazon.com/s?url=search-alias%3Daps&field-keywords={searchTerms}",
				iconUrl: "https://api.faviconkit.com/www.amazon.com/64",
				isEnabled: true,
			}),
			createDefaultEngine({
				type: SearchEngineType.Custom,
				name: "Amazon.co.uk",
				searchUrl: "https://www.amazon.co.uk/s?url=search-alias%3Daps&field-keywords={searchTerms}",
				iconUrl: "https://api.faviconkit.com/www.amazon.com/64",
				isEnabled: false,
			}),
			createDefaultEngine({
				type: SearchEngineType.Custom,
				name: "eBay.com",
				searchUrl: "https://www.ebay.com/sch/{searchTerms}",
				iconUrl: "https://api.faviconkit.com/www.ebay.com/64",
				isEnabled: true,
			}),
			createDefaultEngine({
				type: SearchEngineType.Custom,
				name: "eBay.co.uk",
				searchUrl: "https://www.ebay.co.uk/sch/{searchTerms}",
				iconUrl: "https://api.faviconkit.com/www.ebay.com/64",
				isEnabled: false,
			}),
			createDefaultEngine({
				type: SearchEngineType.Custom,
				name: "Google Maps",
				searchUrl: "https://www.google.com/maps/search/{searchTerms}",
				iconUrl: "https://api.faviconkit.com/maps.google.com/64",
				isEnabled: true,
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
			"https://api.faviconkit.com/www.amazon.com/64"              : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAEq0lEQVRogc1aQWvjRhQWWPoFPq6V00LZQ8HJrZcUEvu0lwSkubfQ5J6Cf8Cy9XkXKws9hQiKfVh3nb000Mop5BTvmN1LqNVC20MjqGGxkbuFzWG/HsbjleSZsSXHdh884jh60vfNfO/NG2U0TWAAHgI4AfAa6zcK4FsAZRHWJPBPAVytF6/SLgHcl4F/CGC0ZoDz2BDA50nwRQD/LnJX3/dRcxzYhMAmBDldh24Y0A0Du+UybEJQcxxQSu+KxCccfA4LaN05PkZxcxO6YSA3dl3gucjP4uYmWmdni5K45ASsLNG+70+A6wLgMiJRt2wbYRguQmJHA9DIAv6eaaYCK5uRUrmM0Shz6j3TALxNExEEAQobG6kBx8DrekxuNcfJSuB3LW1EpVJZCLzI75lmVgLvUxEIgkCdoLo+SVBKKSilqDkOChG5yTxrdUpF4PT0VEmgUqkI43zfF5KI5k5WGaUiYBEiBJEzDBRMU5mMlUpFmewrIVA7PpYCODg8VMc6jrJqyWbvTglwG41GMY3XHAe+7ytj2u22sqTahKyOQBajlMZWY570nMT/hoDv+7GZsca9UXTVFvnaCARBANd1Ydl29oVtHQTCMBQuaqpmTlWFVkqAUhrrheYhMYuYZdurISCrJqrRtQjBbqmkvH4lBIIgQME0hXJIVhTP82ILW7fbVc7MSiQka+Q4iIJpwvM8YWy3211vFQrDcDLyMrm4riuNrzmOdNOzkirUOjtTJm1hRkscJSAaAGvZBKK9TBYJzNpHLH0Gvjo4UI/gjCqy9pXYHrfSye0g91K5LI190WrNXI11w8DNzc3yCHxTrSofnjPEu6owDGfuyPhgPK5Wl0dgVg7wMholQSmdks6sliLt1nJuAr7vzyUDTkRWLkXfR724tbUcAgBib+BkMkjjopi0byhSEfA8by7wMpm4rovi1pb0ut1SKfWbutTNXDKZZT1RFFzBNPGi1QIgl+LB4WGm14yZ2mnXdZWVJUrKIgRBEMTik2U164Y+MwGAbexd14VFyGRvwFsKmxA8rlbR6/Wk8e12GzYhyv4Jf3eY9zvAP+I1Ik5g2AP+/D4ToTuz/ivg8kugrjFvjL2uMXwJixMY9NjF7T3gXfpVcWEb9BjQi33g8gvg+gnQOfpIpv9qKmRaQn/9CDTzjMjVkXTqVmoX+4zAu2DqT+IcGPYYCc58lURuQzbyzTybBYB9buaFl8uTeNADzrcnJD7Ux9L6o8kectd281NcLg2NPYvLqvO1KOq9BqAvveltyG7KkyiaVBd7wPVToS7nskGPAbw6App5NkD8/s08IwQAv56w78QK+E0D8N3Mh/G8qGvxGWlEHvryASP15hEjdv0k4U+ZJNp7QCMRH/3c3otr/WKfxYvtmQZgf64Ruw0ZiOf5j7MQ9boATOLvH5KzGL325QNxCVfn3g7/T+X8PSxPsuf5acB1BeDkddzPt7OuPV7yiMEw9S144jXzUzMxBT76+/k2GwTBwjSn9ZE8cgBgB4scNRj8wnKF671zxPT8epwT/glL+MUr2FsAn8nOS9wH8POiT1ii/QBgY55TK2WwIy4U6z0AMhxjqCF5wGNs/wEm1A75lp2QYwAAAABJRU5ErkJggg==",
			"https://api.faviconkit.com/www.ebay.com/64"                : "data:image/png;base64,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",
			"https://api.faviconkit.com/maps.google.com/64"             : "data:image/png;base64,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",
			"https://translate.google.com/favicon.ico"                  : "data:image/png;base64,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",
			"https://store.steampowered.com/favicon.ico"                : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAFmElEQVRogc2Ze0xTZxjGP5LZC/SA7TlKe9p6gzk3ZwEFBQtY5NLOSxkK0yGIt6FTJiBxTFRiICPLMt2cY8bNaOY0mSxkGoPOGZlOnC4xjmR/uM2wLWHT7KLReeN6nv3BWinnnLbQr+CT/BL4zvu97/OQr6HnHEIoSW20mCJMMc1aswV9xAygbz3CFNOs5aeOozU3IIXzlqURplghwhSLISIwRkvRsBtnTHHnw01xoAljjP026MY1fNxGxjgdwSTMGFcRDO8hGuP0Xo1xBoYJgRASQsU5w8zgwvh4jAQafdyYgMwr+PhsNZ+AkUQZGe8cknllZMJClWEmngSUkQkLB+eemcIqDbMQbBT6mX7XkkEcpxCFPhHBonzbLsjJkrLU617izwd7lD5JGKVPAm0SHatkjQ+U2pgs10fwbj7SWq7QW0GbPR83+G3epbHPOCR7PTV2tvz/CYUhBbSxzisWmZs+d8WAumS8U39EVCfXU9K80pByQWlIBW3668GDR+71OFsRTpxuwaGjp8BGO6A0pEKhT/Go7+npleypMKRelAhgA20aT3ztYUhpsEGhnyN5ZB51dEJpsEHFp3kepcnzJXsPODq2ZSp+LmjTX2bLItHaQHV1dUPFz8WXZy+719p+/UO6v2FOoTuAik8XVHw6aKI0eJpV8elIy97oNQAAKPRpUBszRHulcAdQ85mgjVLvaULNZ+LW7bs+AzjyNkNlyBTtlYIQQkioOZNXG7NAm7p3D3uaMGbh73/u+AyQuagCaj5LtFcam4mE8vavQo0O0IQZN09kLNTowGxHic8AKoMdYaYXRHulUPP2ZhJmng/aSCkqvlD2mkv37j9EmHk+mi987177ue13r7OIZrwTNDlz7qqsQc0EJ8LGOyEIguja3X8fQDPBifCJ2R7r+qlLvM4j9peqwEzKoYL++Ze9/oU7OrvctVEzV2LfJ014a08DRj+dC2ZSDjQTczzqu3t6fM4kruLLV66BiVqM8Oi8IeOv7Eu3ITw6172PicrFwc/OiOqYqFyfM4lEf0QnFSNi8pJB0fbbTb8D+CNjbJFfcyUDuPTBgSZETMnHaB9EW1+lZlwQAN1zBT5nuvAawKW79x6CnVYE3dTlHkQ8W4Ao63pKxgXEZG0SzfCFXwH6a/Xmvbh45ScqpsfGroZu2kqwAUAAtA7VgDlpPbQxq8HFvYK9h8UfQjm137gFNnZN4MSsOUsAWIYaAAB6ewUk5u0Am7AObPw6n/XphXV9tRTQWdaYCCFk0MdITmziBuhmbZANqpu1AWxiCTXc30Z11lJcam0LOEBnVzfY5DK0XL3usb6/8RuwyWWUKX0cgEstW8bZKsDZKpBd9mFAIdg5FZgwb6v7dz6jEq7eNGFTNhV43JVxGZXoD5v+Ov66fW/QAbiMSujtWwAABkcVBvalheiemMuqauHsVZCi9sBp/wPYq2Bdu9v9c1DIqmqRfDLBLaiGHO1/9t2MSH2TdKns/ePgFlS7a7z1CwRJ84QQwi2sKeOyayDFmBdrAQCt12+Aza7BudZfPMznbD8ELrsG1pK9AICS3cck+wSMs2aTbABCCOEW1wnc4jpIcfT8DwCA735sl7xeWt8EAOjo6pG8TgHvjxb/Vwi35G3Isf/04xuWO/c7cOlaO27eevxhf9TZLbs3UIi/b200eXVj2PydkEObvxNtN297HKE79zvAF70nuydQNHl1g3tbM7pgp5NdvhtPAtrCXYN8weEKUbTHya6qx0iiXVE/NPMuMcX7OHbtRxgJmOJ9XEDm+ymELTkosK8dxDDRS2i9Zu0vXfmnpWzFEQQTXfmRcurGRUHeaLjAbvkcNNFVNoif+Qdb2u2N+Wz1cYGtPoahcVzQbv+iwPekYZBuR6OJq206xb55El6pPXlOt/WYmdbc/wBzCQeYcUK7NQAAAABJRU5ErkJggg==",
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

	function runBackwardsCompatibilityUpdates(settings: Settings): boolean
	{
		// add settings that were not available in older versions of SSS
		let shouldSave: boolean = false;

		if (createSettingIfNonExistent(settings, "popupItemVerticalPadding"))        shouldSave = true; // 3.1.0
		if (createSettingIfNonExistent(settings, "allowPopupOnEditableFields"))      shouldSave = true; // 3.6.0
		if (createSettingIfNonExistent(settings, "popupBorderRadius"))               shouldSave = true; // 3.9.1
		if (createSettingIfNonExistent(settings, "popupItemBorderRadius"))           shouldSave = true; // 3.12.0
		if (createSettingIfNonExistent(settings, "minSelectedCharacters"))           shouldSave = true; // 3.13.0
		if (createSettingIfNonExistent(settings, "middleMouseSelectionClickMargin")) shouldSave = true; // 3.14.1
		if (createSettingIfNonExistent(settings, "hidePopupOnRightClick"))           shouldSave = true; // 3.15.0
		if (createSettingIfNonExistent(settings, "popupSeparatorWidth"))             shouldSave = true; // 3.21.0
		if (createSettingIfNonExistent(settings, "popupOpenCommand"))                shouldSave = true; // 3.22.0
		if (createSettingIfNonExistent(settings, "popupDisableCommand"))             shouldSave = true; // 3.22.0
		if (createSettingIfNonExistent(settings, "iconAlignmentInGrid"))             shouldSave = true; // 3.25.0
		if (createSettingIfNonExistent(settings, "popupDelay"))                      shouldSave = true; // 3.29.0
		if (createSettingIfNonExistent(settings, "maxSelectedCharacters"))           shouldSave = true; // 3.30.0
		if (createSettingIfNonExistent(settings, "contextMenuString"))               shouldSave = true; // 3.32.0
		if (createSettingIfNonExistent(settings, "showSelectionTextField"))          shouldSave = true; // 3.40.0
		if (createSettingIfNonExistent(settings, "useCustomPopupCSS"))               shouldSave = true; // 3.40.0
		if (createSettingIfNonExistent(settings, "customPopupCSS"))                  shouldSave = true; // 3.40.0

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
				activateTab(tab.id);
			}
		}, getErrorHandler("Error querying tabs."));
	}

	function activateTab(tabId: number)
	{
		browser.tabs.sendMessage(tabId, {
			type: "activate",
			activationSettings: sss.activationSettingsForContentScript
		}).then(() => {}, () => {});	// suppress errors
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

		// get only the enabled engines
		let engines: SearchEngine[] = sss.settings.searchEngines.filter(engine => engine.isEnabledInContextMenu);

		// define parent menu
		browser.contextMenus.create({
			id: "sss",
			title: sss.settings.contextMenuString,
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

		if (engine === undefined) return;

		// check if it's a special SSS engine
		if (engine.type === SearchEngineType.SSS)
		{
			let engine_SSS = engine as SearchEngine_SSS;

			if (engine_SSS.id === "copyToClipboard") {
				copyToClipboard(engine as SearchEngine_SSS_Copy);
			}
			else if (engine_SSS.id === "openAsLink") {
				let searchUrl = getOpenAsLinkSearchUrl(info.selectionText);
				openUrl(searchUrl, sss.settings.contextMenuItemBehaviour);
			}
		}
		// here we know it's a normal search engine, so run the search
		else
		{
			// search using the engine
			let url = new URL(info.pageUrl);
			let searchUrl = getSearchQuery(engine as SearchEngine_Custom, info.selectionText, url);
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
				browser.tabs.executeScript(tabId, executeScriptOptions)
					.then(() => activateTab(tabId), errorHandler)
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

	function onSearchEngineClick(selectedEngine: SearchEngine, clickType: string, searchText: string, href: string)
	{
		// check if it's a special SSS engine
		if (selectedEngine.type === SearchEngineType.SSS)
		{
			let engine_SSS = selectedEngine as SearchEngine_SSS;

			if (engine_SSS.id === "copyToClipboard") {
				copyToClipboard(engine_SSS as SearchEngine_SSS_Copy);
			}
			else if (engine_SSS.id === "openAsLink") {
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
		else if (selectedEngine.type === SearchEngineType.Custom)
		{
			let engine_Custom = selectedEngine as SearchEngine_Custom;

			let engine = sss.settings.searchEngines.find(
				eng => eng.type === SearchEngineType.Custom && (eng as SearchEngine_Custom).searchUrl === engine_Custom.searchUrl
			) as SearchEngine_Custom;

			if (clickType === "leftClick") {
				openUrl(getSearchQuery(engine, searchText, new URL(href)), sss.settings.mouseLeftButtonBehaviour);
			} else if (clickType === "middleClick") {
				openUrl(getSearchQuery(engine, searchText, new URL(href)), sss.settings.mouseMiddleButtonBehaviour);
			} else if (clickType === "ctrlClick") {
				openUrl(getSearchQuery(engine, searchText, new URL(href)), OpenResultBehaviour.NewBgTab);
			}
		}
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

	// gets the complete search URL by applying the selected text to the engine's own searchUrl
	function getSearchQuery(engine: SearchEngine_Custom, searchText: string, url: URL): string
	{
		// replace newlines with spaces
		searchText = searchText.trim().replace("\r\n", " ").replace("\n", " ");

		let hasCustomEncoding = engine.encoding && engine.encoding !== "utf8";
		if (hasCustomEncoding) {
			// encode to bytes, then convert bytes to hex and add % before each pair of characters (so it can be used in the URL)
			let buffer = iconv.encode(searchText, engine.encoding);
			searchText = "%" + buffer.toString('hex').toUpperCase().replace(/([A-Z0-9]{2})\B/g, '$1%');
		}

		let query = getFilteredSearchUrl(engine.searchUrl, searchText, !hasCustomEncoding);

		// use regex with "g" flag to match all occurences, "i" ignores case
		if (/\{hash\}/i.test(query))     { query = query.replace(/\{hash\}/gi,     encodeURIComponent(url.hash));     }
		if (/\{host\}/i.test(query))     { query = query.replace(/\{host\}/gi,     encodeURIComponent(url.host));     }
		if (/\{hostname\}/i.test(query)) { query = query.replace(/\{hostname\}/gi, encodeURIComponent(url.hostname)); }
		if (/\{href\}/i.test(query))     { query = query.replace(/\{href\}/gi,     encodeURIComponent(url.href));     }
		if (/\{origin\}/i.test(query))   { query = query.replace(/\{origin\}/gi,   encodeURIComponent(url.origin));   }
		if (/\{password\}/i.test(query)) { query = query.replace(/\{password\}/gi, encodeURIComponent(url.password)); }
		if (/\{pathname\}/i.test(query)) { query = query.replace(/\{pathname\}/gi, encodeURIComponent(url.pathname)); }
		if (/\{port\}/i.test(query))     { query = query.replace(/\{port\}/gi,     encodeURIComponent(url.port));     }
		if (/\{protocol\}/i.test(query)) { query = query.replace(/\{protocol\}/gi, encodeURIComponent(url.protocol)); }
		if (/\{search\}/i.test(query))   { query = query.replace(/\{search\}/gi,   encodeURIComponent(url.search));   }
		if (/\{username\}/i.test(query)) { query = query.replace(/\{username\}/gi, encodeURIComponent(url.username)); }

		return query;
	}

	function openUrl(urlToOpen: string, openingBehaviour: OpenResultBehaviour)
	{
		getCurrentTab(tab => {
			const lastTabIndex: number = 9999;	// "guarantees" tab opens as last for some behaviours
			let options = { url: urlToOpen };

			if (openingBehaviour !== OpenResultBehaviour.NewWindow && openingBehaviour !== OpenResultBehaviour.NewBgWindow) {
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
					// options["focused"] = false;	// fails because it's unsupported by Firefox
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

	abstract class SearchTermsModification
	{
		abstract apply(text: string): string;
	}

	class SearchTermsSlice extends SearchTermsModification
	{
		constructor(
			public startIndex: number,
			public endIndex: number)
		{
			super();
		}

		apply(text: string): string
		{
			let endIndex = this.endIndex;
			if (endIndex === null) {
				endIndex = text.length;
			} else if (endIndex < 0) {
				endIndex += text.length;
			}

			let startIndex = this.startIndex;
			if (startIndex === null) {
				startIndex = 0;
			} else if (startIndex < 0) {
				startIndex += text.length;
				if (endIndex === 0) {
					endIndex = text.length;
				}
			}

			try {
				return text.substring(startIndex, endIndex);
			} catch {
				return text;
			}
		}
	}

	class SearchTermsReplacement extends SearchTermsModification
	{
		constructor(
			public source: string,
			public target: string)
		{
			super();
		}

		apply(text: string): string
		{
			return text.split(this.source).join(this.target);	// replace all occurrences
		}
	}

	class SearchTermsRegexReplacement extends SearchTermsModification
	{
		constructor(
			public source: string,
			public flags: string,
			public target: string)
		{
			super();
		}

		apply(text: string): string
		{
			try {
				let regex = new RegExp(this.source, this.flags);
				return text.replace(regex, this.target);	// replace all occurrences
			} catch {
				return text;
			}
		}
	}

	class SearchTermsRegexMatch extends SearchTermsModification
	{
		constructor(
			public source: string,
			public flags: string)
		{
			super();
		}

		apply(text: string): string
		{
			try {
				let regex = new RegExp(this.source, this.flags);
				let match = text.match(regex)
				return match !== null ? match.join("") : text;
			} catch {
				return text;
			}
		}
	}

	class SearchTermsFunction extends SearchTermsModification
	{
		constructor(public functionName: string)
		{
			super();
		}

		apply(text: string): string
		{
			let name = this.functionName.toLowerCase();
			switch (name)
			{
				case "lowercase": return text.toLowerCase();
				case "uppercase": return text.toUpperCase();
				case "encodeuricomponent": return encodeURIComponent(text);
				default: return text;
			}
		}
	}

	class SearchTermsModifications
	{
		constructor(
			public modifications: SearchTermsModification[],
			public searchTermsStartIndex: number,
			public searchTermsEndIndex: number)
		{
		}

		static createDefault(): SearchTermsModifications
		{
			return new SearchTermsModifications([], -1, -1);
		}
	}

	function getFilteredSearchUrl(url: string, text: string, encode: boolean): string
	{
		text = text.trim();

		let searchIndex: number = 0;
		let queryParts: string[] = [];

		while (true)
		{
			let modifications = getSearchTermsReplacements(url, searchIndex);

			if (modifications.searchTermsEndIndex == -1) {
				break;
			}

			queryParts.push(url.substring(searchIndex, modifications.searchTermsStartIndex));
			if (encode) {
				// encode chars after replacement
				queryParts.push(encodeURIComponent(replace(text, modifications.modifications)));
			} else {
				queryParts.push(replace(text, modifications.modifications));
			}
			searchIndex = modifications.searchTermsEndIndex;
		}

		queryParts.push(url.substring(searchIndex));
		return queryParts.join("");
	}

	enum SearchTermsParserState
	{
		EXPECTING_MODIFICATION_OR_END,	// expecting a {}, (), or [] modification block (or the end of searchTerms)
		IN_REPLACE,						// inside a {} replacement block
		IN_REPLACE_REGEX,				// inside a {/ /|} block, between the / /
		IN_REPLACE_REGEX_FLAGS,			// inside a {/ /|} block, after the / /
		IN_REPLACE_SOURCE,				// inside a {|} replacement block, before the |, and we know it's not a regex
		IN_REPLACE_TARGET,				// inside a {|} replacement block, after the |
		IN_FUNCTION,					// inside a () function block
		IN_RANGE_START,					// inside a [] slice block
		IN_RANGE_END,					// inside a [:] slice block, after the :
	}

	function getSearchTermsReplacements(url: string, startIndexForIndexOf: number): SearchTermsModifications
	{
		const startString: string = "{searchTerms";
		let startIndex: number = url.indexOf(startString, startIndexForIndexOf);
		// if searchTerms not found, quit
		if (startIndex === -1) {
			return SearchTermsModifications.createDefault();
		}

		let modifications = SearchTermsModifications.createDefault();

		let index: number = startIndex + startString.length;
		// if searchTerms ends immediately with no replacements, quit
		if (url[index] == "}") {
			modifications.searchTermsStartIndex = startIndex;
			modifications.searchTermsEndIndex = index + 1;
			return modifications;
		}

		let state: SearchTermsParserState = SearchTermsParserState.EXPECTING_MODIFICATION_OR_END;

		let replacementSource: string;
		let replacementTarget: string;
		let isEscaped: boolean = false;

		let regexSource: string;
		let regexFlags: string;

		let functionName: string;

		let rangeStartIndexString: string;
		let rangeEndIndexString: string;

		for (; index < url.length; index++)
		{
			// get char
			let c: string = url[index];

			switch (state)
			{
				case SearchTermsParserState.EXPECTING_MODIFICATION_OR_END: {
					if (c === "}") {
						modifications.searchTermsStartIndex = startIndex;
						modifications.searchTermsEndIndex = index + 1;
						return modifications;
					} else if (c === "{") {
						state = SearchTermsParserState.IN_REPLACE;
						replacementSource = "";
					} else if (c === "[") {
						state = SearchTermsParserState.IN_RANGE_START;
						rangeStartIndexString = "";
					} else if (c === "(") {
						state = SearchTermsParserState.IN_FUNCTION;
						functionName = "";
					} else if (c !== " ") {
						return SearchTermsModifications.createDefault();
					}
					break;
				}

				case SearchTermsParserState.IN_REPLACE: {
					if (index < url.length-2 && c === "r" && url[index+1] === "e" && url[index+2] === "/") {
						state = SearchTermsParserState.IN_REPLACE_REGEX;
						regexSource = "";
						index += 2;
					} else {
						state = SearchTermsParserState.IN_REPLACE_SOURCE;
						index--;
					}
					break;
				}

				case SearchTermsParserState.IN_REPLACE_REGEX: {
					if (c === "/") {
						state = SearchTermsParserState.IN_REPLACE_REGEX_FLAGS;
						regexFlags = "";
					} else {
						regexSource += c;
					}

					if (c === "\\" && index < url.length-1 && url[index+1] === "/") {
						regexSource += "/";
						index += 1;
					}
					break;
				}

				case SearchTermsParserState.IN_REPLACE_REGEX_FLAGS: {
					if (c === "|") {
						state = SearchTermsParserState.IN_REPLACE_TARGET;
						replacementTarget = "";
					} else if (c === "{") {
						return SearchTermsModifications.createDefault();
					} else if (c === "}") {
						modifications.modifications.push(new SearchTermsRegexMatch(regexSource, regexFlags));
						state = SearchTermsParserState.EXPECTING_MODIFICATION_OR_END;
					} else {
						regexFlags += c;
					}
					break;
				}

				case SearchTermsParserState.IN_REPLACE_SOURCE: {
					if (!isEscaped && c === "\\") {
						isEscaped = true;
						continue;
					}

					if (!isEscaped && c === "|") {
						state = SearchTermsParserState.IN_REPLACE_TARGET;
						replacementTarget = "";
					} else if (!isEscaped && c === "{") {
						return SearchTermsModifications.createDefault();
					} else if (!isEscaped && c === "}") {
						return SearchTermsModifications.createDefault();
					} else {
						replacementSource += c;
					}
					break;
				}

				case SearchTermsParserState.IN_REPLACE_TARGET: {
					if (!isEscaped && c === "\\") {
						isEscaped = true;
						continue;
					}

					if (!isEscaped && c === "}") {
						if (regexSource && regexSource.length > 0) {
							modifications.modifications.push(new SearchTermsRegexReplacement(regexSource, regexFlags, replacementTarget));
						} else {
							modifications.modifications.push(new SearchTermsReplacement(replacementSource, replacementTarget));
						}
						state = SearchTermsParserState.EXPECTING_MODIFICATION_OR_END;
					} else if (!isEscaped && (c === "|" || c === "}")) {
						return SearchTermsModifications.createDefault();
					} else {
						replacementTarget += c;
					}
					break;
				}

				case SearchTermsParserState.IN_FUNCTION: {
					if (c === ")") {
						modifications.modifications.push(new SearchTermsFunction(functionName));
						state = SearchTermsParserState.EXPECTING_MODIFICATION_OR_END;
					} else {
						functionName += c;
					}
					break;
				}

				case SearchTermsParserState.IN_RANGE_START: {
					if (c === "]") {
						let rangeStartIndex = rangeStartIndexString.length > 0 ? Number(rangeStartIndexString) : NaN;
						if (isNaN(rangeStartIndex)) {
							return SearchTermsModifications.createDefault();
						} else {
							modifications.modifications.push(new SearchTermsSlice(rangeStartIndex, rangeStartIndex + 1));
						}

						state = SearchTermsParserState.EXPECTING_MODIFICATION_OR_END;
					} else if (c === ":") {
						state = SearchTermsParserState.IN_RANGE_END;
						rangeEndIndexString = "";
					} else {
						rangeStartIndexString += c;
					}
					break;
				}

				case SearchTermsParserState.IN_RANGE_END: {
					if (c === "]") {
						state = SearchTermsParserState.EXPECTING_MODIFICATION_OR_END;

						let rangeStartIndex = rangeStartIndexString.length > 0 ? Number(rangeStartIndexString) : null;
						let rangeEndIndex = rangeEndIndexString.length > 0 ? Number(rangeEndIndexString) : null;

						if (rangeStartIndex === NaN || rangeEndIndex === NaN) {
							return SearchTermsModifications.createDefault();
						} else {
							modifications.modifications.push(new SearchTermsSlice(rangeStartIndex, rangeEndIndex));
						}
					} else {
						rangeEndIndexString += c;
					}
					break;
				}
			}

			if (isEscaped) {
				isEscaped = false;
			}
		}

		return SearchTermsModifications.createDefault();
	}

	function replace(text: string, modifications: SearchTermsModification[]): string
	{
		for (let i = 0; i < modifications.length; i++) {
			let modification: SearchTermsModification = modifications[i];
			text = modification.apply(text);
		}
		return text;
	}

	/* ------------------------------------ */
	/* ------------------------------------ */
	/* ------------------------------------ */
}