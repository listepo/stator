// @mode: js
// @verdict: error
// @code: STA4031
// SUBSET.md: BigInt primitive. SUBSET.md promises not-yet STA1213 (Phase 5); actual:
// the gate accepts the literal but the lowering has no BigInt arm, so it falls through
// to the internal STA4031 (measured 2026-09-19 on agent/p5-residue).

const big = 123n;
export { big };
