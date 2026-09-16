// @mode: ts
// @verdict: static
// SUBSET.md: Generics — an inline generic arrow at a direct call argument is its own use
// site, so it specializes at the parameter's function type under a position-derived key.
// Anything without that position (a `let`, a nesting, a branch, a body that reads an
// enclosing scope) stays not-yet.

console.log([1].map(<T,>(x: T): T => x));
