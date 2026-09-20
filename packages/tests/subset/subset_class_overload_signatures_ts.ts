// @mode: ts
// @verdict: static
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// An overload signature declares a call shape and no code: the one member with a body is the member
// (plan-notes 233). The implementation takes no union, so the file stays static; a union
// implementation is the ordinary union case (golden/ts/class_signatures.ts).

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
