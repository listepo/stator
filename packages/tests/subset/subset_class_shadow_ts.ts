// @mode: ts
// @verdict: static
// SUBSET.md: Class inheritance, super calls, instance methods
// Re-declaring an inherited name with the same kind of member: a field over a field shares one
// slot (the subclass initializers overwrite), and a static over a same-kind static keeps one
// binding per declaring class.

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
export const x = d.x + b.x + D.n + B.n + D.m() + B.m() + D.g + B.g;
