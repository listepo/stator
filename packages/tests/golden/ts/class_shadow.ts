// plan.md §8 step 12(d): same-kind shadowing across an inheritance chain.
// Instance fields share one slot; statics keep one binding per declaring class.

class B {
  x: number = 1;
  static n: number = 10;
  static m(): number {
    return 100;
  }
  static get g(): number {
    return 1000;
  }
  static set g(v: number) {
  }
}

class D extends B {
  override x: number = 2;
  static override n: number = 20;
  static override m(): number {
    return 200;
  }
  static override get g(): number {
    return 2000;
  }
  static override set g(v: number) {
  }
}

const d = new D();
const b: B = d;
console.log(d.x);
console.log(b.x);
console.log(D.n);
console.log(B.n);
console.log(D.m());
console.log(B.m());
console.log(D.g);
console.log(B.g);
D.g = 7;
D.n = 8;
console.log(D.g);
console.log(D.n);
console.log(B.n);
