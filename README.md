Swift Selection Search
=================

## Description

Swift Selection Search (SSS) is a Firefox add-on for quickly searching for some text in a page using your favorite search engines.

Select text on a page and a small popup box with search engines will appear above your cursor. Press one and you'll automatically search for the selected text using that engine!

SSS is configurable. You can define which search engines appear on the popup, the appearance of the icons, what happens when you click them, where the popup appears, whether or not to hide it when the page scrolls, if you want to auto copy text on selection, and many more options.

You also get an optional context menu for searching with any of your engines. You can disable this extra menu in the options if you want. You also have the option of disabling the popup itself and leaving only this context menu. Your choice. :)

SSS is available at the Mozilla Add-ons website, here:

https://addons.mozilla.org/firefox/addon/swift-selection-search

## How to build

Firstly, since WebExtensions are made in JavaScript, we need to be able to convert TypeScript to JavaScript, preferrably in a way that is as automatic as possible.

1. Install *npm*. Download *Node.js* from https://nodejs.org and you will get *npm* alongside it.

1. In the project's folder, run this in the command line:
    > npm install

    This will install the project's TypeScript dependencies locally in the folder *node_modules*.

1. To transpile all .ts scripts to .js (on Windows):
    > "node_modules/.bin/tsc.cmd" --watch -p tsconfig.json

    The command will stay alive and automatically re-transpile code after any changes to .ts files, which is useful while developing.

Now you have .js files, so you can use SSS as a WebExtension. Yay!

- For development, the simpler way is to try SSS is the [about:debugging#addons](about:debugging#addons) page in Firefox. Press the "Load Temporary Add-on" button, select a file in the Swift Selection Search "src" directory (for example *manifest.json*), and it will load the add-on until the browser is closed. Changes to most code require reloading the add-on again.

- For packaging and for more advanced WebExtensions uses, such as auto reloading after each change, please follow Mozilla's instructions [here](https://developer.mozilla.org/Add-ons/WebExtensions/Getting_started_with_web-ext) to install and use the *web-ext* tool.

## TypeScript considerations and warnings

SSS was ported at some point from JavaScript to TypeScript to get the benefits of type annotations, since many errors can be caught by the type checker. However, it should be noted that the interaction of WebExtensions with TypeScript is finicky at best, since TypeScript assumes that scripts can import code/data from other scripts, when in reality the WebExtensions environment has sandboxing and rarely allows that.

Content scripts don't see code from the background script, or vice-versa, and the only way multiple content scripts can even see each other's code is if all of them are injected on the same page by the background script, similarly to how they would if they were included in an HTML page as scripts. TypeScript has no idea that this is how WebExtensions work, so just because something transpiles to JavaScript correctly it doesn't mean the WebExtension will work.

An example that works is that we can declare types/classes in the background script and reference them in other scripts, since only the type checker cares about them. We get type checking and it's fine.

However, if we try adding to those classes some methods, variable assignments, etc, or if we create enums (which have concrete values, so "data") then content scripts or options page scripts won't see these. When transpiling to JavaScript, they will be left as a reference to code in another script, which can't be referenced at runtime due to WebExtensions sandboxing.

So, if you see a class or enum fully or partially declared in more than one script in this project (for example in both background script and page script), the above is why.

Another thing that may fail is using instanceof to check if an object is of a certain class. Don't do this for custom created classes since it may fail due to the sandboxing.
