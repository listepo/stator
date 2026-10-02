// @mode: js
// @verdict: static
// SUBSET.md: `new RegExp(pattern, flags)` and `RegExp(...)`

// A RegExp argument lends its source, and its flags when none are given (§22.2.4.1).
const base = /b+/i;
const copy = new RegExp(base);
const global = new RegExp(base, 'g');
console.log(copy.flags, global.flags, String(RegExp('a\nb')));
