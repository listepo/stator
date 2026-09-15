// @mode: js
// @verdict: dynamic
// SUBSET.md: definite assignment (uninitialized annotated binding)
// A `let` with an annotation but no initializer holds `undefined` at run time --
// this is not TDZ (true syntactic TDZ is TS2448, unmodelled). js mode answers the
// read dynamically; ts mode keeps the checker's refusal (STA0012).
let x: number;
console.log(x);
