// @mode: ts
// @verdict: static
// SUBSET.md: Date
// `new Date()` reads the clock. It is ACCEPTED -- nondeterminism is a proof problem, not an
// acceptance problem (plan §7's determinism carve-out) -- and the lowering desugars it to
// `new Date(Date.now())`, which §21.4.2.1 step 2 defines it as. Its proof is
// tests/unit/date-clock.test.ts, not a golden fixture.
const d = new Date();
console.log(d.getUTCFullYear() > 2000);
