// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: definite assignment (uninitialized annotated binding)
// The same source js mode answers dynamically: reading a binding the checker proves
// is never assigned stays a passthrough refusal in ts mode.
let x: number;
console.log(x);
