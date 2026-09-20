// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — specialization bodies lower before their file's own statements, so
// a named generic whose body reads a same-file `let` (and a `const`, and a `var`) has no
// binding to read there and stays refused. Functions, classes, imports, and globals hoist
// or pre-register and stay accepted.

let base = 100;
function id<T>(x: T): T {
  console.log(base);
  return x;
}
console.log(id(5));
