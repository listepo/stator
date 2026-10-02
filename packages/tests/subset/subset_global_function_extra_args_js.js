// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Global functions

// An argument past the last parameter is evaluated and then ignored; the fixed-arity node has
// no place for it, so it is refused rather than dropped.
console.log(parseInt('10', 10, 'extra'));
