// @mode: ts
// @verdict: dynamic
// SUBSET.md: String.prototype
// `match` answers `RegExpMatchArray | null` -- without /g it IS `exec`, carrying `index`, `input`
// and `groups` on the result; with /g it is the plain list of whole matches. Dynamic for the
// reason `exec` is: the null is real, and the HIR has no union to hold it.

const found = 'a1b'.match(/\d/);
export { found };
