// plan.md §8 step 12(c) S-C: spread of a methods-carrying object literal copies each
// method as data -- the source's bound closure -- so a later call passes the copy.
const o = {
  a: 1,
  m(): number {
    return 7;
  },
};
const c = { ...o };
console.log(c.a, c.m());
// The receiver is the copy, not the source.
const o2 = {
  v: 1,
  get(): number {
    return this.v;
  },
};
const c2 = { ...o2, v: 2 };
console.log(c2.get());
console.log(o2.get());
// A spread factory result keeps its construction-site environment.
function counter() {
  let n = 0;
  return {
    get(): number {
      return n;
    },
    inc(): number {
      n += 1;
      return n;
    },
  };
}
const c3 = { ...counter() };
console.log(c3.get());
console.log(c3.inc());
console.log(c3.get());
// An own key before the spread keeps the spread's methods.
const pre = { z: 0, ...o };
console.log(pre.z, pre.a, pre.m());
// Two methods-only spreads merge; the last writer wins.
const mm = { ...counter(), ...counter() };
console.log(mm.get(), mm.inc());
// A methods-only spread beside a field-carrying one.
const dd = { ...counter(), ...o };
console.log(dd.a, dd.m(), dd.get());
// Functions stringify away on both sides, so JSON sees the data only.
console.log(JSON.stringify(c));
// A spread into an optional-property result copies methods through the shape table.
const d: { a: number; m: () => number; x?: number } = { ...o };
console.log(d.a, d.m());
