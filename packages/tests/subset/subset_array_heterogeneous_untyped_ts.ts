// @mode: ts
// @verdict: dynamic
// SUBSET.md: Arrays: heterogeneous or untyped

// `unknown[]` is an array whose ELEMENT is Unknown. The array itself is perfectly well typed --
// what makes the file dynamic is that nothing can be assumed about what comes out of it.
const arr: unknown[] = [1, 'hello', true];
console.log(arr.length);
