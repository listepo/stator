// @mode: js
// @verdict: static
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// The js-mode twin: overload syntax exists only in a `.ts` file, which js mode compiles alongside
// JavaScript (plan-notes 233).

class Scale {
  factor: number;
  constructor(factor: 2);
  constructor(factor: number);
  constructor(factor: number) {
    this.factor = factor;
  }
  apply(n: 0): 0;
  apply(n: number): number;
  apply(n: number): number {
    return n * this.factor;
  }
}
export const x = new Scale(2).apply(3);
