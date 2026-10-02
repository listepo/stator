// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- a class expression bound by a `let` the file repoints is not a
// formation: erasing the name to one class would compile a different program (plan.md §11d
// T12.3). It stays the anonymous class expression it is.

let P = class {};
P = class {};
console.log(new P());
