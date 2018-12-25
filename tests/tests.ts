class Test
{
	constructor(public url: string, public expectedModifications: SearchTermsModifications, public example: ExampleSelection) { }
}

class ExampleSelection
{
	constructor(public selectedText: string, public expectedResult: string) { }
}

function runTests()
{
	const STM = SearchTermsModifications;
	const Repl = SearchTermsReplacement;
	const ReRepl = SearchTermsRegexReplacement;
	const ReMatch = SearchTermsRegexMatch;
	const Slice = SearchTermsSlice;
	const Func = SearchTermsFunction;
	const ES = ExampleSelection;
	const r = String.raw;

	let tests = [
		// well-formed
		new Test(r`http://a.com?q={searchTerms{ |+}{_|-}} site:{hostname}`,                        new STM([new Repl(" ", "+"), new Repl("_", "-")], 15, 38),                                 new ES("a b_c_",              "http://a.com?q=a+b-c- site:{hostname}")     ),
		new Test(r`http://a.com?q={searchTerms{  |+}{_*&|%%}{cenas|coiso}} site:{hostname}`,       new STM([new Repl("  ", "+"), new Repl("_*&", "%%"), new Repl("cenas", "coiso")], 15, 55), new ES("a b_c_",              "http://a.com?q=a b_c_ site:{hostname}")     ),
		new Test(r`http://a.com?q={searchTerms}`,                                                  new STM([], 15, 28),                                                                       new ES("a b_c_",              "http://a.com?q=a b_c_")                     ),
		new Test(r`http://a.com?q={searchTerms}{searchTerms{a|b}{g|h}}{searchTerms{b|c}{h|i}}`,    new STM([], 15, 28),                                                                       new ES("a bgch",              "http://a.com?q=a bgchb bhcha cgci")         ),
		new Test(r`http://a.com?q={searchTerms{\||\\}{\{|a}}`,                                     new STM([new Repl("|", "\\"), new Repl("{", "a")], 15, 41),                                new ES("a|b\\c{coisas}\\",    "http://a.com?q=a\\b\\cacoisas}\\")          ),
		new Test(r`http://a.com?q={searchTerms{\ |\+}{a|\\}}`,                                     new STM([new Repl(" ", "+"), new Repl("a", "\\")], 15, 41),                                new ES("a | b\\c {coisas}\\", "http://a.com?q=\\+|+b\\c+{cois\\s}\\")      ),
		new Test(r`http://a.com?q={searchTerms{\\|\{\|\}}}`,                                       new STM([new Repl("\\", "{|}")], 15, 39),                                                  new ES("a | b\\c {coisas}\\", "http://a.com?q=a | b{|}c {coisas}{|}")      ),
		new Test(r`http://a.com?q={searchTerms{|+}{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([new Repl("", "+"), new Repl("_*&", "%%"), new Repl("cenas", "coiso")], 15, 53),   new ES("a b_c_",              "http://a.com?q=a+ +b+_+c+_ site:{hostname}")),
		new Test(r`http://a.com?q={searchTerms{ |}{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([new Repl(" ", ""), new Repl("_*&", "%%"), new Repl("cenas", "coiso")], 15, 53),   new ES("a b_c_",              "http://a.com?q=ab_c_ site:{hostname}")      ),

		// malformed
		new Test(r`http://a.com?q={searchTerms |+}{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ +}{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+}_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+}{_*&%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+}{_*&|%%{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+}{_*&|%%}cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenascoiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenas|coiso} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenas|coiso}asdasda} site:{hostname}`, new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenas|coiso} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenas|coiso}`,                         new STM([], -1, -1), new ES("a b_c_", null)),

		// ranges
		new Test(r`http://a.com?q={searchTerms[0]}`,     new STM([new Slice(0, 1)], 15, 31),       new ES("a b_c_", "http://a.com?q=a")),
		new Test(r`http://a.com?q={searchTerms[1]}`,     new STM([new Slice(1, 2)], 15, 31),       new ES("a b_c_", "http://a.com?q= ")),
		new Test(r`http://a.com?q={searchTerms[1:]}`,    new STM([new Slice(1, null)], 15, 32),    new ES("a b_c_", "http://a.com?q= b_c_")),
		new Test(r`http://a.com?q={searchTerms[1:4]}`,   new STM([new Slice(1, 4)], 15, 33),       new ES("a b_c_", "http://a.com?q= b_")),
		new Test(r`http://a.com?q={searchTerms[1:10]}`,  new STM([new Slice(1, 10)], 15, 34),      new ES("a b_c_", "http://a.com?q= b_c_")),
		new Test(r`http://a.com?q={searchTerms[:4]}`,    new STM([new Slice(null, 4)], 15, 32),    new ES("a b_c_", "http://a.com?q=a b_")),
		new Test(r`http://a.com?q={searchTerms[:10]}`,   new STM([new Slice(null, 10)], 15, 33),   new ES("a b_c_", "http://a.com?q=a b_c_")),
		new Test(r`http://a.com?q={searchTerms[:]}`,     new STM([new Slice(null, null)], 15, 31), new ES("a b_c_", "http://a.com?q=a b_c_")),
		new Test(r`http://a.com?q={searchTerms[5]}`,     new STM([new Slice(5, 6)], 15, 31),       new ES("a b_c_", "http://a.com?q=_")),
		new Test(r`http://a.com?q={searchTerms[5:6]}`,   new STM([new Slice(5, 6)], 15, 33),       new ES("a b_c_", "http://a.com?q=_")),
		new Test(r`http://a.com?q={searchTerms[5:7]}`,   new STM([new Slice(5, 7)], 15, 33),       new ES("a b_c_", "http://a.com?q=_")),
		new Test(r`http://a.com?q={searchTerms[6]}`,     new STM([new Slice(6, 7)], 15, 31),       new ES("a b_c_", "http://a.com?q=")),
		new Test(r`http://a.com?q={searchTerms[6:7]}`,   new STM([new Slice(6, 7)], 15, 33),       new ES("a b_c_", "http://a.com?q=")),
		new Test(r`http://a.com?q={searchTerms[6:10]}`,  new STM([new Slice(6, 10)], 15, 34),      new ES("a b_c_", "http://a.com?q=")),
		new Test(r`http://a.com?q={searchTerms[7]}`,     new STM([new Slice(7, 8)], 15, 31),       new ES("a b_c_", "http://a.com?q=")),
		new Test(r`http://a.com?q={searchTerms[7:10]}`,  new STM([new Slice(7, 10)], 15, 34),      new ES("a b_c_", "http://a.com?q=")),
		new Test(r`http://a.com?q={searchTerms[-1:]}`,   new STM([new Slice(-1, null)], 15, 33),   new ES("a b_c_", "http://a.com?q=_")),
		new Test(r`http://a.com?q={searchTerms[-2:]}`,   new STM([new Slice(-2, null)], 15, 33),   new ES("a b_c_", "http://a.com?q=c_")),
		new Test(r`http://a.com?q={searchTerms[-2:-2]}`, new STM([new Slice(-2, -2)], 15, 35),     new ES("a b_c_", "http://a.com?q=")),
		new Test(r`http://a.com?q={searchTerms[-1]}`,    new STM([new Slice(-1, 0)], 15, 32),      new ES("a b_c_", "http://a.com?q=_")),
		new Test(r`http://a.com?q={searchTerms[-2]}`,    new STM([new Slice(-2, -1)], 15, 32),     new ES("a b_c_", "http://a.com?q=c")),
		new Test(r`http://a.com?q={searchTerms[-10]}`,   new STM([new Slice(-10, -9)], 15, 33),    new ES("a b_c_", "http://a.com?q=")),

		new Test(r`http://a.com?q={searchTerms[]}`,      new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms[}]}`,     new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms[1ab]}`,   new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms[}`,       new STM([], -1, -1), new ES("a b_c_", null)),

		// functions
		new Test(r`http://a.com?q={searchTerms(lowercase)}`, new STM([new Func("lowercase")], 15, 39), new ES("a B_c_", "http://a.com?q=a b_c_")),
		new Test(r`http://a.com?q={searchTerms(uppercase)}`, new STM([new Func("uppercase")], 15, 39), new ES("a b_c_", "http://a.com?q=A B_C_")),
		new Test(r`http://a.com?q={searchTerms(upperlol)}`,  new STM([new Func("upperlol")], 15, 38), new ES("a b_c_", "http://a.com?q=a b_c_")),
		new Test(r`http://a.com?q={searchTerms({})}`,        new STM([new Func("{}")], 15, 32), new ES("a b_c_", "http://a.com?q=a b_c_")),

		// mixed
		new Test(r`http://a.com?q={searchTerms[0](uppercase)}`, new STM([new Slice(0, 1), new Func("uppercase")], 15, 42), new ES("a b_c_", "http://a.com?q=A")),
		new Test(r`http://a.com?q={searchTerms(uppercase)[0]}`, new STM([new Func("uppercase"), new Slice(0, 1)], 15, 42), new ES("a b_c_", "http://a.com?q=A")),
		new Test(r`http://a.com?q={searchTerms{ |_}{_|aaa}(uppercase){A|b}{c|12345}{C|}[:-2]}`,
			new STM([new Repl(" ", "_"), new Repl("_", "aaa"), new Func("uppercase"), new Repl("A", "b"), new Repl("c", "12345"), new Repl("C", ""), new Slice(null, -2)], 15, 74),
			new ES("a b_c_", "http://a.com?q=bbbbBbbbb")
		),
		new Test(r`http://a.com?q={searchTerms{ |_}{_|aaa}(uppercase)[2:7]{B|b}}`,
			new STM([new Repl(" ", "_"), new Repl("_", "aaa"), new Func("uppercase"), new Slice(2, 7), new Repl("B", "b")], 15, 61),
			new ES("a b_c_", "http://a.com?q=AAbAA")
		),

		// regex
		new Test(r`http://a.com?q={searchTerms{re/([^0-9a-z])/gi|$1abc}}`,   new STM([new ReRepl("([^0-9a-z])", "gi", "$1abc")], 15, 53), new ES("a b_c_", "http://a.com?q=a abcb_abcc_abc")),
		new Test(r`http://a.com?q={searchTerms{re/[^0-9a-z]/gi}}`,           new STM([new ReMatch("[^0-9a-z]", "gi")], 15, 45), new ES("a b_c_", "http://a.com?q= __")),
		new Test(r`http://a.com?q={searchTerms{re/\w/gi}}`,                  new STM([new ReMatch("\\w", "gi")], 15, 38), new ES("a b_c_", "http://a.com?q=ab_c_")),
		new Test(r`http://a.com?q={searchTerms{re/\//gi}}`,                  new STM([new ReMatch("\\/", "gi")], 15, 38), new ES("a/b/c", "http://a.com?q=//")),
		new Test(r`http://a.com?q={searchTerms{re/\///gi}}`,                 new STM([new ReMatch("\\/", "/gi")], 15, 39), new ES("a b_c_", "http://a.com?q=a b_c_")),
		new Test(r`http://a.com?q={searchTerms{r/\///gi}}`,                  new STM([], -1, -1), new ES("a b_c_", null)),
		new Test(r`http://a.com?q={searchTerms{re/(\w+)\s+(\w+)/gi|$2 $1}}`, new STM([new ReRepl("(\\w+)\\s+(\\w+)", "gi", "$2 $1")], 15, 55), new ES("John Smith ", "http://a.com?q=Smith John")),
	];

	for (const test of tests)
	{
		let modifications = getSearchTermsReplacements(test.url, 0);
		let replacementsString = JSON.stringify(modifications.modifications);
		let expectedReplacementsString = JSON.stringify(test.expectedModifications.modifications);

		echo("///////////// " + JSON.stringify(test));

		if (replacementsString !== expectedReplacementsString) {
			echo("FAIL\nreplacements\nexpected: " + expectedReplacementsString + "\nactual:   " + replacementsString);
		}
		if (modifications.searchTermsStartIndex !== test.expectedModifications.searchTermsStartIndex) {
			echo("FAIL\nstartIndex\nexpected: " + test.expectedModifications.searchTermsStartIndex + "\nactual:   " + modifications.searchTermsStartIndex);
		}
		if (modifications.searchTermsEndIndex !== test.expectedModifications.searchTermsEndIndex) {
			echo("FAIL\nendIndex\nexpected: " + test.expectedModifications.searchTermsEndIndex + "\nactual:   " + modifications.searchTermsEndIndex);
		}

		let filteredUrl = getFilteredSearchUrl(test.url, test.example.selectedText, false);
		if (filteredUrl != (test.example.expectedResult !== null ? test.example.expectedResult : test.url)) {
			echo("FAIL\nfilteredUrl\nexpected: " + test.example.expectedResult + "\nactual:   " + filteredUrl);
		}
	}
}

function echo(text: string)
{
	document.body.appendChild(document.createTextNode(text));
	document.body.appendChild(document.createElement("br"));
	console.log(text);
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

// -----------------------------------------------------------------------
// -----------------------------------------------------------------------
// -----------------------------------------------------------------------

runTests();
