// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// Two constructor BODIES are TS2392, which the checker reports before the gate runs; the gate no
// longer counts constructors (plan-notes 233).

class A {
  x: number;
  constructor() {
    this.x = 1;
  }
  constructor(y: number) {
    this.x = y;
  }
}
export const x = new A().x;
