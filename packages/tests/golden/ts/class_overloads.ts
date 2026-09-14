// plan.md §8 step 12(d): constructor, method and static overload signatures.
// The implementation runs; callers through any signature reach it.

class C {
  n: number;
  constructor(n: string);
  constructor(n: number);
  constructor(n: string | number) {
    this.n = typeof n === "number" ? n : 1;
  }
  m(x: string): string;
  m(x: number): number;
  m(x: string | number): string | number {
    return x;
  }
  static make(s: string): number;
  static make(n: number): number;
  static make(v: string | number): number {
    return typeof v === "number" ? v : 0;
  }
}

const c = new C("a");
console.log(c.n);
console.log(new C(2).n);
console.log(c.m("a"));
console.log(c.m(7));
console.log(C.make("x"));
console.log(C.make(9));
