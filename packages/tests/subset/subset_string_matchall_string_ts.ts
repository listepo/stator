// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: String.prototype.matchAll
// A non-regexp argument is RegExpCreate, which this compiler does not have.

console.log('a1b'.matchAll('\\d'));
