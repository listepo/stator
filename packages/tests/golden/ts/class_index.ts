// plan.md §8 step 12(d): index signatures on classes.
// The signature adds no slot; declared members behave exactly as without it.

class C {
  [k: string]: unknown;
  x: number = 1;
  m(): number {
    return this.x + 1;
  }
}

class D {
  [k: string]: number;
  x: number = 1;
}

const c = new C();
console.log(c.x);
console.log(c.m());
console.log("x" in c);
const d = new D();
console.log(d.x);
console.log("x" in d);
