// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// The js-mode twin: `declare` exists only in a `.ts` file, which js mode compiles alongside
// JavaScript (plan-notes 233).

class C {
  declare v: number;
}
export const x = new C().v;
