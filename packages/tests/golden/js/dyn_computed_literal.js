// Computed object-literal keys with a literal type are static keys (plan.md §8 step 22):
// `k` has type `"dyn"`, so `[k]` is the name `dyn` and the literal takes the fixed path,
// exactly as the direct spelling does.

const k = "dyn";

// Base: value read by both spellings.
const o = { [k]: 1 };
console.log(o.dyn);
console.log(o["dyn"]);
console.log(typeof o.dyn);

// An integer-like literal key is the same key the direct spelling writes.
const zi = "0";
const oi = { [zi]: 1, b: 2 };
console.log(oi["0"]);
console.log(oi.b);

// A method beside the computed key rides the method table; the call passes `this`.
const om = { x: 10, [k]: 2, m(a) { return this.x + a; } };
console.log(om.m(5));
console.log(om.dyn);
console.log(om.x);

// An accessor beside the computed key.
let backing = 0;
const oa = {
  [k]: 2,
  get g() { return backing + 1; },
  set g(v) { backing = v; },
};
console.log(oa.g);
oa.g = 41;
console.log(oa.g);
console.log(oa.dyn);

// A method and an accessor together force the dynamic path, where the method is an own
// data property in written position and the accessor is a pair in its slot.
function combo(key) {
  const oc = { a: 1, [key]: 2, m() { return this.a + 100; }, get g() { return this.a + 1000; }, b: 3 };
  console.log(oc.m());
  console.log(oc.g);
  console.log(Object.keys(oc).join(","));
}
combo("dyn");
