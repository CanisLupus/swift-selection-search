// Original script by Jared Jacobs, located at github.com/2is10/selectionchange-polyfill
// License: http://unlicense.org
// Adapted for Swift Selection Search by Daniel Lobo.

var selectionchange = (function () {

	var MAC = /^Mac/.test(navigator.platform);
	var MAC_MOVE_KEYS = [65, 66, 69, 70, 78, 80]; // A, B, E, F, P, N from support.apple.com/en-ie/HT201236
	var SELECT_ALL_MODIFIER = MAC ? "metaKey" : "ctrlKey";
	var RANGE_PROPS = ["startContainer", "startOffset", "endContainer", "endOffset"];
	var HAS_OWN_SELECTION = {INPUT: 1, TEXTAREA: 1};

	var ranges;

	return {
		start: function (doc) {
			var d = doc || document;
			if (ranges || (ranges = new WeakMap())) {
				if (!ranges.has(d)) {
					ranges.set(d, getSelectionRange(d));
					d.addEventListener("input", onInput, true);
					d.addEventListener("keydown", onKeyDown, true);
					d.addEventListener("mouseup", onMouseUp, true);
					// d.defaultView.addEventListener("focus", onFocus, true);
				}
			}
		},
		stop: function (doc) {
			var d = doc || document;
			if (ranges && ranges.has(d)) {
				ranges["delete"](d);
				d.removeEventListener("input", onInput, true);
				d.removeEventListener("keydown", onKeyDown, true);
				d.removeEventListener("mouseup", onMouseUp, true);
				// d.defaultView.removeEventListener("focus", onFocus, true);
			}
		},
		modifier: SELECT_ALL_MODIFIER
	};

	function getSelectionRange(doc) {
		var s = doc.getSelection();
		return s !== null && s.rangeCount ? s.getRangeAt(0) : null;
	}

	function onInput(e) {
		if (!HAS_OWN_SELECTION[e.target.tagName]) {
			dispatchIfChanged(this, true, e);
		}
	}

	function onKeyDown(e) {
		var code = e.keyCode;
		if (code === 65 && e[SELECT_ALL_MODIFIER] && !e.shiftKey && !e.altKey || // Ctrl-A or Cmd-A
			code >= 35 && code <= 40 || // home, end and arrow key
			e.ctrlKey && MAC && MAC_MOVE_KEYS.indexOf(code) >= 0)
		{
			if (!HAS_OWN_SELECTION[e.target.tagName]) {	// comment to enable selections with keyboard
				setTimeout(dispatchIfChanged.bind(null, this, true, e), 0);
			}
		}
	}

	function onMouseUp(e) {
		if (e.button === 0) {
			setTimeout(dispatchIfChanged.bind(null, this, HAS_OWN_SELECTION[e.target.tagName], e), 0);
		}
	}

	// function onFocus(e) {
	// 	setTimeout(dispatchIfChanged.bind(null, this.document, e), 0);
	// }

	function dispatchIfChanged(doc, force, e) {
		var r = getSelectionRange(doc);
		if (force || !sameRange(r, ranges.get(doc))) {
			ranges.set(doc, r);
			var event = new CustomEvent("customselectionchange");
			event.altKey = e.altKey;
			setTimeout(doc.dispatchEvent.bind(doc, event), 0);
		}
	}

	function sameRange(r1, r2) {
		return r1 === r2 || r1 && r2 && RANGE_PROPS.every(function (prop) {
			return r1[prop] === r2[prop];
		});
	}
})();
