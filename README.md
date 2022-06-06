Swift Selection Search
=================

-------------------------------

## ⚠ NOTE: Development is on an indefinite break (Sorry!) ⚠

- Please use the issues page _only_ to report very problematic bugs you may find.
- This project is not accepting pull requests.
- I do encourage you to work on your own version of SSS and publish it as an improved addon. Even for other browsers!

You can read more about this [here](https://github.com/CanisLupus/swift-selection-search/issues/230).

-------------------------------

## Description

Swift Selection Search (SSS) is a Firefox add-on for quickly searching for some text in a page using your favorite search engines.

Select text on a page and a small popup box with search engines will appear above your cursor. Press one and you'll automatically search for the selected text using that engine!

SSS is configurable. You can define which search engines appear on the popup, the appearance of the icons, what happens when you click them, where the popup appears, whether or not to hide it when the page scrolls, if you want to auto copy text on selection, and many more options.

You also get an optional context menu for searching with any of your engines. You can disable this extra menu in the options if you want. You also have the option of disabling the popup itself and leaving only this context menu. Your choice. :)

SSS is available at the Mozilla Add-ons website, here:

https://addons.mozilla.org/firefox/addon/swift-selection-search

## How to build

Firstly, since WebExtensions are made in JavaScript, we need to be able to convert TypeScript to JavaScript, preferably in a way that is as automatic as possible.

1. Install *npm*. Download *Node.js* from https://nodejs.org and you will get *npm* alongside it.

1. In the project's folder, run this in the command line:
	> npm install

	This will install the project's TypeScript dependencies locally in the folder *node_modules*.

1. To transpile all .ts scripts to .js (on Windows):
	> "node_modules/.bin/tsc.cmd" --watch -p tsconfig.json

	The command will stay alive and automatically re-transpile code after any changes to .ts files, which is useful while developing.

Now you have .js files, so you can use SSS as a WebExtension. Yay!

- For short development or just curiosity, the simpler way to try SSS is the [about:debugging#addons](about:debugging#addons) page in Firefox. Press the "Load Temporary Add-on" button, select a file in the Swift Selection Search "src" directory (for example *manifest.json*), and it will load the add-on until the browser is closed. Changes to most code require reloading the add-on again.

- For more prolonged development and/or packaging, such as auto reloading after each change, please follow Mozilla's instructions [here](https://developer.mozilla.org/Add-ons/WebExtensions/Getting_started_with_web-ext) to install and use the *web-ext* tool.

## How to contribute code to SSS

### Preparation

1. Fork the repository on GitHub and clone it to your computer.

1. Follow the instructions above for **How to build**.

	In the end you should have a script that automatically transpiles code from TypeScript to JavaScript, and should know how to run your version of SSS on Firefox.

1. Learn that SSS has 3 main branches:
	- **master** - Final versions that are published to Mozilla Add-ons. "master" will usually point to a commit where the SSS version changes, since those are the ones published (commonly, there's a commit just to update the version).
	- **develop** -  Where development happens and where new features will be merged to. Less stable, but shouldn't have incomplete features.
	- **addon-sdk** - Can be ignored, since it's the code for SSS before it was a WebExtension. Essentially an archive.

1. Read the code guidelines below.

### Code guidelines

- Tabs for indentation, please! ;) (Spaces can be used to align things.)
- No whitespace at the end of lines. Settings like VSCode's "files.trimTrailingWhitespace" help with this.
- Try to follow the style you see in the existing code. If you think it's inconsistent in some places, feel free to do your own thing. It will be reviewed anyway. ;)
- SSS currently supports Firefox 63 onward, which means that you must take extra care when using an WebExtensions API. Make sure it exists in Firefox 63, or at least that the code doesn't run and crash on older versions. Ideally, install Firefox 63 separately on your computer (having a different Firefox profile for that helps greatly) and disable its auto updates.

### Collaboration

1. Find an issue you'd like to solve in the issues list.

1. Ask if anyone is working on it already. Additionally, if it's missing details on how to implement or if you want to know of possible approaches, feel free to ask!

1. Create a new Git branch for the new feature or bug fix you are trying to implement. Create this branch from "develop", to simplify the merge later on (since "master" may not have all current changes).

1. Implement and commit/push the changes to the branch, possibly in multiple commits.

1. Finally create a pull request to merge your changes to the original repository. It will be subject to code review, discussion and possibly changes if needed.

	Thanks!

## TypeScript considerations and warnings

SSS was ported at some point from JavaScript to TypeScript to get the benefits of type annotations, since many errors can be caught by the type checker. However, it should be noted that the interaction of WebExtensions with TypeScript is finicky at best, since TypeScript assumes that scripts can import code/data from other scripts, when in reality the WebExtensions environment has sandboxing and rarely allows that.

Content scripts don't see code from the background script, or vice-versa, and the only way multiple content scripts can even see each other's code is if all of them are injected on the same page by the background script, similarly to how they would if they were included in an HTML page as scripts. TypeScript has no idea that this is how WebExtensions work, so just because something transpiles to JavaScript correctly it doesn't mean the WebExtension will work.

An example that works is that we can declare types/classes in the background script and reference them in other scripts, since only the type checker cares about them. We get type checking and it's fine.

However, if we try adding to those classes some methods, variable assignments, etc, then content scripts or options page scripts won't see these. When transpiling to JavaScript, they will be left as a reference to code in another script, which can't be referenced at runtime due to WebExtensions sandboxing. This is also true of enums (which have concrete values, so "data") UNLESS we declare them as `const enum`, in which case TypeScript copies their values to where they are used instead of creating JavaScript objects.

So, if you see a class fully or partially declared in more than one script in this project (for example in both background script and page script), the above is why.

Another thing that may fail is using `instanceof` to check if an object is of a certain class. Don't do this for custom created classes since it may fail due to the sandboxing.
