// @mode: ts
// @verdict: static
// SUBSET.md: `new RegExp(pattern, flags)` and `RegExp(...)`

// A pattern built at run time compiles at run time (a bad one throws a SyntaxError there).
const word = 'a+';
const re = new RegExp(word, 'g');
console.log(re.source, re.flags, re.test('caat'), RegExp('x/y').source);
