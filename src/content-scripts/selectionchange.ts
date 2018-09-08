// Original script by Jared Jacobs, located at github.com/2is10/selectionchange-polyfill
// License: http://unlicense.org
// Adapted for Swift Selection Search by Daniel Lobo.

namespace selectionchange
{
	let MAC = /^Mac/.test(navigator.platform);
	let MAC_MOVE_KEYS = new Set([65, 66, 69, 70, 78, 80]); // A, B, E, F, P, N from support.apple.com/en-ie/HT201236
	export let modifierKey = MAC ? "metaKey" : "ctrlKey";

	let ranges = null;

	export function start() {
		ranges = getSelectedRanges();
		document.addEventListener("input", onInput, true);
		document.addEventListener("keydown", onKeyDown, true);
		document.addEventListener("mouseup", onMouseUp, true);
	}

	export function stop() {
		ranges = null;
		document.removeEventListener("input", onInput, true);
		document.removeEventListener("keydown", onKeyDown, true);
		document.removeEventListener("mouseup", onMouseUp, true);
	}

	export class CustomSelectionChangeEvent extends CustomEvent<any> {
		altKey: boolean;
	}

	function getSelectedRanges()
	{
		let selection = document.getSelection();
		let newRanges = [];

		if (selection !== null) {
			for (let i = 0; i < selection.rangeCount; i++) {
				newRanges.push(selection.getRangeAt(i));
			}
		}

		return newRanges;
	}

	function onInput(ev)
	{
		if (!isInputField(ev.target)) {
			dispatchEventIfSelectionChanged(true, ev);
		}
	}

	function onKeyDown(ev)
	{
		let code = ev.keyCode;

		if ((code === 65 && ev[modifierKey] && !ev.shiftKey && !ev.altKey) // Ctrl-A or Cmd-A
			|| (code >= 35 && code <= 40) // home, end and arrow keys
			|| (ev.ctrlKey && MAC && MAC_MOVE_KEYS.has(code)))
		{
			if (!isInputField(ev.target)) {	// comment to enable selections with keyboard
				setTimeout(() => dispatchEventIfSelectionChanged(true, ev), 0);
			}
		}
	}

	function onMouseUp(ev)
	{
		if (ev.button === 0) {
			setTimeout(() => dispatchEventIfSelectionChanged(isInputField(ev.target), ev), 0);
		}
	}

	function dispatchEventIfSelectionChanged(force, ev)
	{
		let newRanges = getSelectedRanges();

		if (force || !areAllRangesEqual(newRanges, ranges)) {
			ranges = newRanges;
			let event = new CustomSelectionChangeEvent("customselectionchange");
			event.altKey = ev.altKey;
			setTimeout(() => document.dispatchEvent(event), 0);
		}
	}

	function isInputField(elem)
	{
		return elem.tagName === "INPUT" || elem.tagName === "TEXTAREA";
	}

	// compares two lists of ranges to see if the ranges are the exact same
	function areAllRangesEqual(rs1, rs2)
	{
		if (rs1.length !== rs2.length) {
			return false;
		}

		for (let i = 0; i < rs1.length; i++)
		{
			const r1 = rs1[i];
			const r2 = rs2[i];

			let areEqual = r1.startContainer === r2.startContainer
						&& r1.startOffset === r2.startOffset
						&& r1.endContainer === r2.endContainer
						&& r1.endOffset === r2.endOffset;

			if (!areEqual) {
				return false;
			}
		}

		return true;
	}
}