// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Decorators. SUBSET.md promises error STA1112 (v1 non-goal, both modes);
// actual: the ts parser path reaches the subset boundary first and the gate answers
// not-yet STA1214 (measured 2026-09-19 on agent/p5-residue).

function dec() {}
class C {
  @dec
  x: number = 42;
}
export { C };
