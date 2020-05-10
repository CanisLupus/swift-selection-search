namespace SearchVariables
{
	export function modifySearchVariable(url: string, variableName: string, text: string, encode: boolean): string
	{
		text = text.trim();

		let searchIndex: number = 0;
		let queryParts: string[] = [];

		while (true)
		{
			let variableModifications = getSearchVariableReplacements(url, variableName, searchIndex);

			if (variableModifications.searchVariableEndIndex == -1) {
				break;
			}

			queryParts.push(url.substring(searchIndex, variableModifications.searchVariableStartIndex));

			let replacedText: string = replace(text, variableModifications.modifications);

			// encode chars after replacement (but only if the modifications DON'T include the disableURIEncoding function)
			if (encode && !variableModifications.containsDisableURIEncoding()) {
				replacedText = encodeURIComponent(replacedText);
			}

			queryParts.push(replacedText);
			searchIndex = variableModifications.searchVariableEndIndex;
		}

		queryParts.push(url.substring(searchIndex));
		return queryParts.join("");
	}

	abstract class SearchVariableModification
	{
		abstract apply(text: string): string;
	}

	export class SearchVariableSlice extends SearchVariableModification	// exported for tests
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

	export class SearchVariableReplacement extends SearchVariableModification	// exported for tests
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

	export class SearchVariableRegexReplacement extends SearchVariableModification	// exported for tests
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

	export class SearchVariableRegexMatch extends SearchVariableModification	// exported for tests
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

	export class SearchVariableFunction extends SearchVariableModification	// exported for tests
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
				case "disableuriencoding": return text;	// doesn't apply anything, only makes it so that the variable doesn't get encoded at the end
				default: return text;
			}
		}
	}

	export class SearchVariableModifications	// exported for tests
	{
		constructor(
			public modifications: SearchVariableModification[],
			public searchVariableStartIndex: number,
			public searchVariableEndIndex: number)
		{
		}

		static createDefault(): SearchVariableModifications
		{
			return new SearchVariableModifications([], -1, -1);
		}

		containsDisableURIEncoding(): boolean
		{
			return this.modifications.find(mod => (mod instanceof SearchVariableFunction) && mod.functionName.toLowerCase() == "disableuriencoding") !== undefined;
		}
	}

	enum SearchVariableParserState
	{
		EXPECTING_MODIFICATION_OR_END,	// expecting a {}, (), or [] modification block (or the end of the variable name, like "searchTerms")
		IN_REPLACE,						// inside a {} replacement block
		IN_REPLACE_REGEX,				// inside a {/ /|} block, between the / /
		IN_REPLACE_REGEX_FLAGS,			// inside a {/ /|} block, after the / /
		IN_REPLACE_SOURCE,				// inside a {|} replacement block, before the |, and we know it's not a regex
		IN_REPLACE_TARGET,				// inside a {|} replacement block, after the |
		IN_FUNCTION,					// inside a () function block
		IN_RANGE_START,					// inside a [] slice block
		IN_RANGE_END,					// inside a [:] slice block, after the :
	}

	export function getSearchVariableReplacements(url: string, variableName: string, startIndexForIndexOf: number): SearchVariableModifications	// exported for tests
	{
		const startString: string = "{" + variableName;	// find things like {searchTerms, {href, etc

		// this is essentially a case insensitive "url.indexOf(startString, startIndexForIndexOf)" (JavaScript doesn't have it)
		var regex = new RegExp("\\" + startString, "i");	// slash to escape the {, "i" to be case insensitive
		let startIndex: number = url.substring(startIndexForIndexOf).search(regex);

		// if variable not found, quit
		if (startIndex === -1) {
			return SearchVariableModifications.createDefault();
		}

		let modifications = SearchVariableModifications.createDefault();

		startIndex += startIndexForIndexOf;

		let index: number = startIndex + startString.length;
		// if variable ends immediately with no replacements, quit
		if (url[index] == "}") {
			modifications.searchVariableStartIndex = startIndex;
			modifications.searchVariableEndIndex = index + 1;
			return modifications;
		}

		let state: SearchVariableParserState = SearchVariableParserState.EXPECTING_MODIFICATION_OR_END;

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
				case SearchVariableParserState.EXPECTING_MODIFICATION_OR_END: {
					if (c === "}") {
						modifications.searchVariableStartIndex = startIndex;
						modifications.searchVariableEndIndex = index + 1;
						return modifications;
					} else if (c === "{") {
						state = SearchVariableParserState.IN_REPLACE;
						replacementSource = "";
					} else if (c === "[") {
						state = SearchVariableParserState.IN_RANGE_START;
						rangeStartIndexString = "";
					} else if (c === "(") {
						state = SearchVariableParserState.IN_FUNCTION;
						functionName = "";
					} else if (c !== " ") {
						return SearchVariableModifications.createDefault();
					}
					break;
				}

				case SearchVariableParserState.IN_REPLACE: {
					if (index < url.length-2 && c === "r" && url[index+1] === "e" && url[index+2] === "/") {
						state = SearchVariableParserState.IN_REPLACE_REGEX;
						regexSource = "";
						index += 2;
					} else {
						state = SearchVariableParserState.IN_REPLACE_SOURCE;
						index--;
					}
					break;
				}

				case SearchVariableParserState.IN_REPLACE_REGEX: {
					if (c === "/") {
						state = SearchVariableParserState.IN_REPLACE_REGEX_FLAGS;
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

				case SearchVariableParserState.IN_REPLACE_REGEX_FLAGS: {
					if (c === "|") {
						state = SearchVariableParserState.IN_REPLACE_TARGET;
						replacementTarget = "";
					} else if (c === "{") {
						return SearchVariableModifications.createDefault();
					} else if (c === "}") {
						modifications.modifications.push(new SearchVariableRegexMatch(regexSource, regexFlags));
						state = SearchVariableParserState.EXPECTING_MODIFICATION_OR_END;
					} else {
						regexFlags += c;
					}
					break;
				}

				case SearchVariableParserState.IN_REPLACE_SOURCE: {
					if (!isEscaped && c === "\\") {
						isEscaped = true;
						continue;
					}

					if (!isEscaped && c === "|") {
						state = SearchVariableParserState.IN_REPLACE_TARGET;
						replacementTarget = "";
					} else if (!isEscaped && c === "{") {
						return SearchVariableModifications.createDefault();
					} else if (!isEscaped && c === "}") {
						return SearchVariableModifications.createDefault();
					} else {
						replacementSource += c;
					}
					break;
				}

				case SearchVariableParserState.IN_REPLACE_TARGET: {
					if (!isEscaped && c === "\\") {
						isEscaped = true;
						continue;
					}

					if (!isEscaped && c === "}") {
						if (regexSource && regexSource.length > 0) {
							modifications.modifications.push(new SearchVariableRegexReplacement(regexSource, regexFlags, replacementTarget));
						} else {
							modifications.modifications.push(new SearchVariableReplacement(replacementSource, replacementTarget));
						}
						state = SearchVariableParserState.EXPECTING_MODIFICATION_OR_END;
					} else if (!isEscaped && (c === "|" || c === "}")) {
						return SearchVariableModifications.createDefault();
					} else {
						replacementTarget += c;
					}
					break;
				}

				case SearchVariableParserState.IN_FUNCTION: {
					if (c === ")") {
						modifications.modifications.push(new SearchVariableFunction(functionName));
						state = SearchVariableParserState.EXPECTING_MODIFICATION_OR_END;
					} else {
						functionName += c;
					}
					break;
				}

				case SearchVariableParserState.IN_RANGE_START: {
					if (c === "]") {
						let rangeStartIndex = rangeStartIndexString.length > 0 ? Number(rangeStartIndexString) : NaN;
						if (isNaN(rangeStartIndex)) {
							return SearchVariableModifications.createDefault();
						} else {
							modifications.modifications.push(new SearchVariableSlice(rangeStartIndex, rangeStartIndex + 1));
						}

						state = SearchVariableParserState.EXPECTING_MODIFICATION_OR_END;
					} else if (c === ":") {
						state = SearchVariableParserState.IN_RANGE_END;
						rangeEndIndexString = "";
					} else {
						rangeStartIndexString += c;
					}
					break;
				}

				case SearchVariableParserState.IN_RANGE_END: {
					if (c === "]") {
						state = SearchVariableParserState.EXPECTING_MODIFICATION_OR_END;

						let rangeStartIndex = rangeStartIndexString.length > 0 ? Number(rangeStartIndexString) : null;
						let rangeEndIndex = rangeEndIndexString.length > 0 ? Number(rangeEndIndexString) : null;

						if (rangeStartIndex === NaN || rangeEndIndex === NaN) {
							return SearchVariableModifications.createDefault();
						} else {
							modifications.modifications.push(new SearchVariableSlice(rangeStartIndex, rangeEndIndex));
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

		return SearchVariableModifications.createDefault();
	}

	function replace(text: string, modifications: SearchVariableModification[]): string
	{
		for (let i = 0; i < modifications.length; i++) {
			let modification: SearchVariableModification = modifications[i];
			text = modification.apply(text);
		}
		return text;
	}
}