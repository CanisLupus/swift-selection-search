class Test
{
	constructor(public variableName: string, public url: string, public expectedModifications: SearchVariables.SearchVariableModifications, public example: ExampleSelection) { }
}

class ExampleSelection
{
	constructor(public selectedText: string, public expectedResult: string) { }
}

function runTests()
{
	const STM = SearchVariables.SearchVariableModifications;
	const Repl = SearchVariables.SearchVariableReplacement;
	const ReRepl = SearchVariables.SearchVariableRegexReplacement;
	const ReMatch = SearchVariables.SearchVariableRegexMatch;
	const Slice = SearchVariables.SearchVariableSlice;
	const Func = SearchVariables.SearchVariableFunction;
	const ES = ExampleSelection;
	const r = String.raw;

	let tests = [
		// well-formed
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}{_|-}} site:{hostname}`,                        new STM([new Repl(" ", "+"), new Repl("_", "-")], 15, 38),                                 new ES("a b_c_",              "http://a.com?q=a+b-c- site:{hostname}")     ),
		new Test("searchTerms", r`http://a.com?q={searchTerms{  |+}{_*&|%%}{cenas|coiso}} site:{hostname}`,       new STM([new Repl("  ", "+"), new Repl("_*&", "%%"), new Repl("cenas", "coiso")], 15, 55), new ES("a b_c_",              "http://a.com?q=a b_c_ site:{hostname}")     ),
		new Test("searchTerms", r`http://a.com?q={searchTerms}`,                                                  new STM([], 15, 28),                                                                       new ES("a b_c_",              "http://a.com?q=a b_c_")                     ),
		new Test("searchTerms", r`http://a.com?q={searchTerms}{searchTerms{a|b}{g|h}}{searchTerms{b|c}{h|i}}`,    new STM([], 15, 28),                                                                       new ES("a bgch",              "http://a.com?q=a bgchb bhcha cgci")         ),
		new Test("searchTerms", r`http://a.com?q={searchTerms{\||\\}{\{|a}}`,                                     new STM([new Repl("|", "\\"), new Repl("{", "a")], 15, 41),                                new ES("a|b\\c{coisas}\\",    "http://a.com?q=a\\b\\cacoisas}\\")          ),
		new Test("searchTerms", r`http://a.com?q={searchTerms{\ |\+}{a|\\}}`,                                     new STM([new Repl(" ", "+"), new Repl("a", "\\")], 15, 41),                                new ES("a | b\\c {coisas}\\", "http://a.com?q=\\+|+b\\c+{cois\\s}\\")      ),
		new Test("searchTerms", r`http://a.com?q={searchTerms{\\|\{\|\}}}`,                                       new STM([new Repl("\\", "{|}")], 15, 39),                                                  new ES("a | b\\c {coisas}\\", "http://a.com?q=a | b{|}c {coisas}{|}")      ),
		new Test("searchTerms", r`http://a.com?q={searchTerms{|+}{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([new Repl("", "+"), new Repl("_*&", "%%"), new Repl("cenas", "coiso")], 15, 53),   new ES("a b_c_",              "http://a.com?q=a+ +b+_+c+_ site:{hostname}")),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |}{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([new Repl(" ", ""), new Repl("_*&", "%%"), new Repl("cenas", "coiso")], 15, 53),   new ES("a b_c_",              "http://a.com?q=ab_c_ site:{hostname}")      ),

		// malformed
		new Test("searchTerms", r`http://a.com?q={searchTerms |+}{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ +}{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+{_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}_*&|%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}{_*&%%}{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}{_*&|%%{cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}{_*&|%%}cenas|coiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenascoiso}} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenas|coiso} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenas|coiso}asdasda} site:{hostname}`, new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenas|coiso} site:{hostname}`,         new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |+}{_*&|%%}{cenas|coiso}`,                         new STM([], -1, -1), new ES("a b_c_", null)),

		// ranges
		new Test("searchTerms", r`http://a.com?q={searchTerms[0]}`,     new STM([new Slice(0, 1)], 15, 31),       new ES("a b_c_", "http://a.com?q=a")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[1]}`,     new STM([new Slice(1, 2)], 15, 31),       new ES("a b_c_", "http://a.com?q= ")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[1:]}`,    new STM([new Slice(1, null)], 15, 32),    new ES("a b_c_", "http://a.com?q= b_c_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[1:4]}`,   new STM([new Slice(1, 4)], 15, 33),       new ES("a b_c_", "http://a.com?q= b_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[1:10]}`,  new STM([new Slice(1, 10)], 15, 34),      new ES("a b_c_", "http://a.com?q= b_c_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[:4]}`,    new STM([new Slice(null, 4)], 15, 32),    new ES("a b_c_", "http://a.com?q=a b_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[:10]}`,   new STM([new Slice(null, 10)], 15, 33),   new ES("a b_c_", "http://a.com?q=a b_c_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[:]}`,     new STM([new Slice(null, null)], 15, 31), new ES("a b_c_", "http://a.com?q=a b_c_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[5]}`,     new STM([new Slice(5, 6)], 15, 31),       new ES("a b_c_", "http://a.com?q=_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[5:6]}`,   new STM([new Slice(5, 6)], 15, 33),       new ES("a b_c_", "http://a.com?q=_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[5:7]}`,   new STM([new Slice(5, 7)], 15, 33),       new ES("a b_c_", "http://a.com?q=_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[6]}`,     new STM([new Slice(6, 7)], 15, 31),       new ES("a b_c_", "http://a.com?q=")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[6:7]}`,   new STM([new Slice(6, 7)], 15, 33),       new ES("a b_c_", "http://a.com?q=")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[6:10]}`,  new STM([new Slice(6, 10)], 15, 34),      new ES("a b_c_", "http://a.com?q=")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[7]}`,     new STM([new Slice(7, 8)], 15, 31),       new ES("a b_c_", "http://a.com?q=")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[7:10]}`,  new STM([new Slice(7, 10)], 15, 34),      new ES("a b_c_", "http://a.com?q=")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[-1:]}`,   new STM([new Slice(-1, null)], 15, 33),   new ES("a b_c_", "http://a.com?q=_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[-2:]}`,   new STM([new Slice(-2, null)], 15, 33),   new ES("a b_c_", "http://a.com?q=c_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[-2:-2]}`, new STM([new Slice(-2, -2)], 15, 35),     new ES("a b_c_", "http://a.com?q=")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[-1]}`,    new STM([new Slice(-1, 0)], 15, 32),      new ES("a b_c_", "http://a.com?q=_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[-2]}`,    new STM([new Slice(-2, -1)], 15, 32),     new ES("a b_c_", "http://a.com?q=c")),
		new Test("searchTerms", r`http://a.com?q={searchTerms[-10]}`,   new STM([new Slice(-10, -9)], 15, 33),    new ES("a b_c_", "http://a.com?q=")),

		new Test("searchTerms", r`http://a.com?q={searchTerms[]}`,      new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms[}]}`,     new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms[1ab]}`,   new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms[}`,       new STM([], -1, -1), new ES("a b_c_", null)),

		// functions
		new Test("searchTerms", r`http://a.com?q={searchTerms(lowercase)}`, new STM([new Func("lowercase")], 15, 39), new ES("a B_c_", "http://a.com?q=a b_c_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms(uppercase)}`, new STM([new Func("uppercase")], 15, 39), new ES("a b_c_", "http://a.com?q=A B_C_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms(upperlol)}`,  new STM([new Func("upperlol")], 15, 38), new ES("a b_c_", "http://a.com?q=a b_c_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms({})}`,        new STM([new Func("{}")], 15, 32), new ES("a b_c_", "http://a.com?q=a b_c_")),

		// mixed
		new Test("searchTerms", r`http://a.com?q={searchTerms[0](uppercase)}`, new STM([new Slice(0, 1), new Func("uppercase")], 15, 42), new ES("a b_c_", "http://a.com?q=A")),
		new Test("searchTerms", r`http://a.com?q={searchTerms(uppercase)[0]}`, new STM([new Func("uppercase"), new Slice(0, 1)], 15, 42), new ES("a b_c_", "http://a.com?q=A")),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |_}{_|aaa}(uppercase){A|b}{c|12345}{C|}[:-2]}`,
			new STM([new Repl(" ", "_"), new Repl("_", "aaa"), new Func("uppercase"), new Repl("A", "b"), new Repl("c", "12345"), new Repl("C", ""), new Slice(null, -2)], 15, 74),
			new ES("a b_c_", "http://a.com?q=bbbbBbbbb")
		),
		new Test("searchTerms", r`http://a.com?q={searchTerms{ |_}{_|aaa}(uppercase)[2:7]{B|b}}`,
			new STM([new Repl(" ", "_"), new Repl("_", "aaa"), new Func("uppercase"), new Slice(2, 7), new Repl("B", "b")], 15, 61),
			new ES("a b_c_", "http://a.com?q=AAbAA")
		),

		// regex
		new Test("searchTerms", r`http://a.com?q={searchTerms{re/([^0-9a-z])/gi|$1abc}}`,   new STM([new ReRepl("([^0-9a-z])", "gi", "$1abc")], 15, 53), new ES("a b_c_", "http://a.com?q=a abcb_abcc_abc")),
		new Test("searchTerms", r`http://a.com?q={searchTerms{re/[^0-9a-z]/gi}}`,           new STM([new ReMatch("[^0-9a-z]", "gi")], 15, 45), new ES("a b_c_", "http://a.com?q= __")),
		new Test("searchTerms", r`http://a.com?q={searchTerms{re/\w/gi}}`,                  new STM([new ReMatch("\\w", "gi")], 15, 38), new ES("a b_c_", "http://a.com?q=ab_c_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms{re/\//gi}}`,                  new STM([new ReMatch("\\/", "gi")], 15, 38), new ES("a/b/c", "http://a.com?q=//")),
		new Test("searchTerms", r`http://a.com?q={searchTerms{re/\///gi}}`,                 new STM([new ReMatch("\\/", "/gi")], 15, 39), new ES("a b_c_", "http://a.com?q=a b_c_")),
		new Test("searchTerms", r`http://a.com?q={searchTerms{r/\///gi}}`,                  new STM([], -1, -1), new ES("a b_c_", null)),
		new Test("searchTerms", r`http://a.com?q={searchTerms{re/(\w+)\s+(\w+)/gi|$2 $1}}`, new STM([new ReRepl("(\\w+)\\s+(\\w+)", "gi", "$2 $1")], 15, 55), new ES("John Smith ", "http://a.com?q=Smith John")),

		// non-searchTerms variables (actually just a copy of the "well-formed" tests above, but with another variable)
		new Test("href", r`http://a.com?q={href{ |+}{_|-}} site:{hostname}`,                  new STM([new Repl(" ", "+"), new Repl("_", "-")], 15, 31),                                 new ES("a b_c_",              "http://a.com?q=a+b-c- site:{hostname}")     ),
		new Test("href", r`http://a.com?q={href{  |+}{_*&|%%}{cenas|coiso}} site:{hostname}`, new STM([new Repl("  ", "+"), new Repl("_*&", "%%"), new Repl("cenas", "coiso")], 15, 48), new ES("a b_c_",              "http://a.com?q=a b_c_ site:{hostname}")     ),
		new Test("href", r`http://a.com?q={href}`,                                            new STM([], 15, 21),                                                                       new ES("a b_c_",              "http://a.com?q=a b_c_")                     ),
		new Test("href", r`http://a.com?q={href}{href{a|b}{g|h}}{href{b|c}{h|i}}`,            new STM([], 15, 21),                                                                       new ES("a bgch",              "http://a.com?q=a bgchb bhcha cgci")         ),
		new Test("href", r`http://a.com?q={href{\||\\}{\{|a}}`,                               new STM([new Repl("|", "\\"), new Repl("{", "a")], 15, 34),                                new ES("a|b\\c{coisas}\\",    "http://a.com?q=a\\b\\cacoisas}\\")          ),
		new Test("href", r`http://a.com?q={href{\ |\+}{a|\\}}`,                               new STM([new Repl(" ", "+"), new Repl("a", "\\")], 15, 34),                                new ES("a | b\\c {coisas}\\", "http://a.com?q=\\+|+b\\c+{cois\\s}\\")      ),
		new Test("href", r`http://a.com?q={href{\\|\{\|\}}}`,                                 new STM([new Repl("\\", "{|}")], 15, 32),                                                  new ES("a | b\\c {coisas}\\", "http://a.com?q=a | b{|}c {coisas}{|}")      ),
		new Test("href", r`http://a.com?q={href{|+}{_*&|%%}{cenas|coiso}} site:{hostname}`,   new STM([new Repl("", "+"), new Repl("_*&", "%%"), new Repl("cenas", "coiso")], 15, 46),   new ES("a b_c_",              "http://a.com?q=a+ +b+_+c+_ site:{hostname}")),
		new Test("href", r`http://a.com?q={href{ |}{_*&|%%}{cenas|coiso}} site:{hostname}`,   new STM([new Repl(" ", ""), new Repl("_*&", "%%"), new Repl("cenas", "coiso")], 15, 46),   new ES("a b_c_",              "http://a.com?q=ab_c_ site:{hostname}")      ),
	];

	for (const test of tests)
	{
		let modifications = SearchVariables.getSearchVariableReplacements(test.url, test.variableName, 0);
		let replacementsString = JSON.stringify(modifications.modifications);
		let expectedReplacementsString = JSON.stringify(test.expectedModifications.modifications);

		echo("///////////// " + JSON.stringify(test));

		if (replacementsString !== expectedReplacementsString) {
			echo("FAIL\nreplacements\nexpected: " + expectedReplacementsString + "\nactual:   " + replacementsString);
		}
		if (modifications.searchVariableStartIndex !== test.expectedModifications.searchVariableStartIndex) {
			echo("FAIL\nstartIndex\nexpected: " + test.expectedModifications.searchVariableStartIndex + "\nactual:   " + modifications.searchVariableStartIndex);
		}
		if (modifications.searchVariableEndIndex !== test.expectedModifications.searchVariableEndIndex) {
			echo("FAIL\nendIndex\nexpected: " + test.expectedModifications.searchVariableEndIndex + "\nactual:   " + modifications.searchVariableEndIndex);
		}

		let filteredUrl = SearchVariables.modifySearchVariable(test.url, test.variableName, test.example.selectedText, false);
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

runTests();
