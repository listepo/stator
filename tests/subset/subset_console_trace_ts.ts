// @mode: ts
// @verdict: static
// SUBSET.md: console
// Landed 2026-09-01 under the DETERMINISM CARVE-OUT: a duration measures this machine on this run
// and a stack is frames this runtime has no unwinder to produce, so neither can be held to Node
// byte-for-byte. The proof is a shape assertion instead -- tests/unit/console-carveout.test.ts.
// The gate treats them like every other console member: only arity is its business.

console.trace('why');
