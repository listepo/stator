// @mode: js
// @verdict: static
// The refusal TS2695 raises is a style lint, so dropping it leaves a fully TYPED expression --
// js mode compiles the comma operator statically, it does not need the dynamic path.
// SUBSET.md: comma operator
console.log((0, 1));
