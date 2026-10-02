// @mode: js
// @verdict: dynamic
// SUBSET.md: Global functions
// `Array.from(x)` is the `...` spread's drain plus the array-like read (plan.md §11c T11.4
// step 5): a string, an iterator, an array-like object.
const m = new Map();
m.set('k', 1);
console.log(Array.from('ab'), Array.from({ length: 2, 0: 'x' }), Array.from(m.keys()));
