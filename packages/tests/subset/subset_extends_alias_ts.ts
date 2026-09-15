// @mode: ts
// @verdict: static
// SUBSET.md: Classes -- `extends K` where `const K = C` grounds to the target's layout
// (plan.md §8 step 43): the alias binds no value, so the subclass compiles exactly as if it
// named `C` -- descriptor, inherited members, vtable, super-call and instanceof alike.

class C {
  x: number = 1;
  m(): number {
    return this.x + 1;
  }
}
const K = C;

class D extends K {
  y: number = 2;
  constructor() {
    super();
    this.y = 20;
  }
  override m(): number {
    return super.m() + 1;
  }
}

const d = new D();
console.log(d.m());
console.log(d instanceof D);
console.log(d instanceof C);
