Swift Selection Search
=================

#### Description

Swift Selection Search (SSS) is a simple Firefox add-on that lets you quickly search for some text in a page using your favorite search engines.

Select some text on a page and a small popup box will appear below the text, containing an icon for each search engine that you have configured in Firefox. Press that icon and you'll automatically search for the selected text using that engine.

SSS is configurable. You can define which search engines show on the panel, the size of the icons, their padding, what happens when you click or middle-click them, if they are displayed in a single line or not, whether or not to hide the popup when the page scrolls, etc.

You also get an optional context menu "Search With..." as a bonus, which appears when you right click the page after selecting text and lets you search with any of your engines. You can disable this extra context menu in the settings whenever you want. You also have the option of disabling the popup panel itself and leaving only this context menu. Your choice. :)

SSS is available at the Mozilla Add-ons website, here:
https://addons.mozilla.org/en-us/firefox/addon/swift-selection-search/

#### How to build

1. Install Node.js from https://nodejs.org/.
2. Node comes with a package manager, npm. Run this on the command line:

	npm install jpm --global
	
	(For more details, see https://developer.mozilla.org/Add-ons/SDK/Tools/jpm#Installation)
	
3. Now you have jpm, the tool for developing Firefox Add-ons. Open the "src" folder in a command line and either use "jpm run" to test the add-on in a sandbox or "jpm xpi" to generate a file that you can drag to Firefox to install.

#### Known issues

- Changing the zoom level on a page or opening a sidebar (such as the bookmarks) will cause the popup panel to show with a certain offset from the right position, which would be immediately below the selected text.
- In a few webpages the popup will not show, or it will show when not desired (case of a few text fields). This seems to be due to a limitation of Firefox when detecting text selection.
