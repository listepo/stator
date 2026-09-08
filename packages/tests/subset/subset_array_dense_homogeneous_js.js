// @mode: js
// @verdict: static
// SUBSET.md: Arrays: dense, homogeneous element type

// js mode is not "always dynamic": it infers. `[1, 2, 3]` is `number[]` whether or not anyone
// wrote the annotation, so this compiles on exactly the same static path as the ts fixture.
const arr = [1, 2, 3];
console.log(arr.length);
