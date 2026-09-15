// Computed class member names with literal-typed keys: `[k]` with `k: "m"` is the name
// the direct spelling writes, so every spelling of the member answers the same
// (plan.md §8 step 12(d)).

const k = "m";
const f = "count";
const a = "val";
const s = "total";

class C {
  [f]: number = 10;
  [k](): number {
    return 5;
  }
  get [a](): number {
    return this[f];
  }
  set [a](v: number) {
    this[f] = v;
  }
  static [s]: number = 100;
  static [k](): number {
    return 7;
  }
}

const c = new C();
console.log(c.m());
console.log(c[k]());
console.log(new C()[k]());
console.log(c.count);
console.log(c[f]);
c[f] = 11;
console.log(c.count);
c[f] += 1;
console.log(c[f]);
console.log(c.val);
c.val = 20;
console.log(c.val);
c[a] = 30;
console.log(c[a]);
console.log(C.m());
console.log(C.total);
