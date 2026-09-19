// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Proxy object. SUBSET.md promises not-yet STA1203 (Phase 8) in js mode;
// actual: the gate answers the generic subset boundary STA1214 (measured 2026-09-19 on
// agent/p5-residue).

const p = new Proxy({}, {});
export { p };
