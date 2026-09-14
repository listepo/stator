// plan.md §8 step 12(d): always-present optional members in js mode.

class C {
  constructor() {
    this.x = 5;
  }
  m() {
    return this.x ?? 0;
  }
}

const c = new C();
console.log(c.x);
if (c.m !== undefined) {
  console.log(c.m());
}
