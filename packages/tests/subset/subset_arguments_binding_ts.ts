// @mode: ts
// @verdict: error
// @code: STA1003
// SUBSET.md: arguments binding. SUBSET.md promises error STA1105 in ts mode; actual:
// the checker fires first -- the untyped `f()` reads `arguments` with no annotation, so
// the implicit-any refusal STA1003 precedes the STA1105 arm (measured 2026-09-19 on
// agent/p5-residue; p5-10's scope note concurs).

function f() {
  const a = arguments[0];
  return a;
}
export { f };
