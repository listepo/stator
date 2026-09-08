// @mode: js
// @verdict: dynamic
// SUBSET.md: Arrays: heterogeneous or untyped

// Inferred as `(string | number | boolean)[]`. HType has no union yet, so the element is Unknown --
// the same dynamic path the ts fixture reaches by writing `unknown[]` out loud.
const arr = [1, 'hello', true];
console.log(arr.length);
