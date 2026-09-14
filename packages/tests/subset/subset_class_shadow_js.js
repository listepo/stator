// @mode: js
// @verdict: static
// SUBSET.md: Class inheritance, super calls, instance methods
// Re-declaring an inherited name with the same kind of member: a field over a field shares one
// slot (the subclass initializers overwrite), and a static over a same-kind static keeps one
// binding per declaring class.

class B {
  x;
  static n = 10;
  constructor() {
    this.x = 1;
  }
  static m() {
    return 100;
  }
}

class D extends B {
  x;
  static n = 20;
  constructor() {
    super();
    this.x = 2;
  }
  static m() {
    return 200;
  }
}

const d = new D();
export const x = d.x + D.n + B.n + D.m() + B.m();
