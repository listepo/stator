// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Map, Set
// Each collection op is one fixed-arity node, and a spread's count is not its arity.
const m = new Map();
m.set('a', 1);
console.log(m.get(...['a']));
