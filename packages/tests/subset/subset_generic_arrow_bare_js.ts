// @mode: js
// @verdict: static
// SUBSET.md: Generics — a generic arrow with no variable to specialize under (here, a
// callback) has nowhere to build a second copy for; the assigned shape compiles today.

console.log([1].map(<T,>(x: T): T => x));
