// plan.md §8 step 12(d): optional methods and initialized optional fields.
// The `?` only narrows assignability; both members are always present at runtime.

class C {
  x?: number = 5;
  m?(): number {
    return this.x ?? 0;
  }
}

const c = new C();
console.log(c.x);
if (c.m !== undefined) {
  console.log(c.m());
}
console.log(c.m !== undefined ? c.m() : -1);
