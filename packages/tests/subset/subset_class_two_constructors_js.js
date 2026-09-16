// @mode: js
// @verdict: error
// @code: STA0012
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// The js-mode twin: in JavaScript two constructors are an early SyntaxError, and the checker reports
// it for a `.js` file too (plan-notes 233).

class A {
  constructor() {
    this.x = 1;
  }
  constructor(y) {
    this.x = y;
  }
}
export const x = new A().x;
