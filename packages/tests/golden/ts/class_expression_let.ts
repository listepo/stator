// A `let X = class { … }` that nothing repoints lowers like the `const` formation (plan.md §11d
// T12.3).
let Counter = class {
  count = 0;
  bump(by: number): number {
    this.count += by;
    return this.count;
  }
};
const c = new Counter();
c.bump(2);
console.log(c.bump(3), c instanceof Counter);
