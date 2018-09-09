Swift Selection Search
=================

## Description

Swift Selection Search (SSS) is a Firefox add-on for quickly searching for some text in a page using your favorite search engines.

Select text on a page and a small popup box with search engines will appear above your cursor. Press one and you'll automatically search for the selected text using that engine!

SSS is configurable. You can define which search engines appear on the popup, the appearance of the icons, what happens when you click them, where the popup appears, whether or not to hide it when the page scrolls, if you want to auto copy text on selection, and many more options.

You also get an optional context menu for searching with any of your engines. You can disable this extra menu in the options if you want. You also have the option of disabling the popup itself and leaving only this context menu. Your choice. :)

SSS is available at the Mozilla Add-ons website, here:
https://addons.mozilla.org/firefox/addon/swift-selection-search

## TypeScript considerations

SSS was ported from JavaScript to TypeScript to get the benefits of type annotations, since many errors can be caught by the type checker. However, it should be noted that WebExtensions do not support TypeScript, since TypeScript assumes that scripts can import code from other scripts, when in the WebExtensions' environment that rarely happens because of sandboxing.

Content scripts don't see code from the background script, or vice-versa, and the only way content scripts can even see each other's code is if all are injected on the same page by the background script (similarly to how they would if added from an HTML page as scripts). TypeScript has no idea that this is how WebExtensions work, so just because something transpiles to JavaScript correctly it doesn't mean the WebExtension will work.

As an example, we can declare types/classes in the background script and use them in other scripts, since only the type checker cares about them, but if we try adding any code inside those classes (methods, assignments, etc), or enums (which have specific values, so... code) then content scripts or options page scripts won't be able to see it because when transpiling to JavaScript it will be left as a reference to code in another script, which can't be imported.

**Conclusion:** If you see a class or enum fully or partially declared in more than one script in this project, the above is why.

## How to build

Due to the use of TypeScript, building SSS is now quite more complicated than before... :(

1. Get *npm* to install the project's dependencies. Download *Node.js* from https://nodejs.org and you will get *npm* alongside it.
1. In the project's folder, run this in the command line: `npm install`
    - This will install the TypeScript dependencies locally in the folder *node_modules*.
1. Run this to transpile all .ts scripts to .js (on Windows): `"node_modules/.bin/tsc.cmd" --watch -p tsconfig.json`
    - The command will stay alive and automatically re-transpile code after any changes to .ts files, which is useful.
    - Are there errors? Unfortunately, the TypeScript bindings (declarations of things and what types they use) I was able to get for WebExtensions are not fully up to date, so some methods will be seen as non-existent (example: `browser.commands.update`). They will still transpile "as-is" to JavaScript, but you can add bindings to `node_modules\web-ext-types\global\index.d.ts` if you want to stop the errors.

Now you have .js files, so you can package SSS as a WebExtension. Yay!

The simpler way is to try the [about:debugging#addons](about:debugging#addons) page in Firefox if you just want to test it out. Press the "Load Temporary Add-on" button, select a file in the Swift Selection Search "src" directory (for example manifest.json), and it will load the add-on from the folder until the browser is closed.

For packaging and more advanced WebExtensions uses, please follow Mozilla's instructions [here](https://developer.mozilla.org/Add-ons/WebExtensions/Getting_started_with_web-ext) to install and use the *web-ext* tool. They explain how to build and run WebExtensions on Firefox.
