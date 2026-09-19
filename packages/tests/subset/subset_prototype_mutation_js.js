// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Prototype mutation: Object.setPrototypeOf(), __proto__ writes. SUBSET.md
// promises not-yet STA1204 (Phase 8) in js mode; actual: the gate answers the generic
// subset boundary STA1214 (measured 2026-09-19 on agent/p5-residue).

const obj = {};
Object.setPrototypeOf(obj, null);
export { obj };
