// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — specialization bodies lower before their file's own statements, so
// a same-file `let` (and a `const`, and a `var`) is no binding yet where the body reads it.
// Functions, classes, imports, and globals hoist or pre-register and stay accepted.

const base = 100;
console.log([1].map(<T>(x: T): number => (x as unknown as number) + base));
