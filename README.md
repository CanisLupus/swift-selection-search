Swift Selection Search
=================

#### Description

Swift Selection Search (SSS) is a simple Firefox add-on that lets you quickly search for some text in a page using your favorite search engines.

Select some text on a page and a small popup box will appear below the text, containing an icon for each search engine that you have configured in Firefox. Press that icon and you'll automatically search for the selected text using that engine.

SSS is configurable. You can define which search engines show on the panel, the size of the icons, their padding, what happens when you click or middle-click them, if they are displayed in a single line or not, whether or not to hide the popup when the page scrolls, etc.

You also get an optional context menu "Search With..." as a bonus, which appears when you right click the page after selecting text and lets you search with any of your engines. You can disable this extra context menu in the settings whenever you want. You also have the option of disabling the popup panel itself and leaving only this context menu. Your choice. :)

SSS is available at the Mozilla Add-ons website, here:
https://addons.mozilla.org/firefox/addon/swift-selection-search/

#### How to build

Please follow the instructions here:
https://developer.mozilla.org/Add-ons/WebExtensions/Getting_started_with_web-ext

They explain how to build and run any WebExtension on Firefox.

You can also try the [about:debugging#addon](about:debugging#addon) page in Firefox if you just want to test it out. Press the "Load Temporary Add-on" button, select a file in the Swift Selection Search "src" directory (for example manifest.json), and it will load the add-on.
