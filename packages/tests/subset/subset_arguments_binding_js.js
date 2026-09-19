// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: arguments binding. SUBSET.md promises not-yet STA1202 (Phase 5 stretch) in
// js mode; actual: the gate answers the generic subset boundary STA1214 (measured
// 2026-09-19 on agent/p5-residue).

function f() {
  const a = arguments[0];
  return a;
}
export { f };
