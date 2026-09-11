// `delete` (plan.md §8 step 2a(c)). The operator answers a boolean and REMOVES the key, and the
// second half is what this fixture exists for: a slot quietly set to `undefined` would pass the
// read alone, so every removal here is also checked through `in` and through the printer, which
// walk the shape chain rather than the value. Removing a key REBUILDS that chain, so the surviving
// keys must keep their insertion order and a re-added key must land at the end.
const o = {};
o.a = 1;
o.b = 2;
o.c = 3;
console.log(delete o.a);
console.log(o.a);
console.log('a' in o);
console.log('b' in o);
console.log(o);

// Deleting what was never there succeeds — there is nothing to remove.
console.log(delete o.zz);

// The computed form is the same operator with the key spelled as an expression.
const key = 'b';
console.log(delete o[key]);
console.log(o);

// The object still grows after the rebuild, and a re-added key goes to the END of the enumeration
// order rather than back to the slot it used to hold.
o.a = 10;
o.d = 4;
console.log(o);
console.log(o.a);
console.log(o.c);

// Two objects that lost the same key stay interchangeable at one read site — the point of
// replaying the chain from the root rather than patching a shape other objects also sit on.
function read(v) {
  return v.c;
}
const p = {};
p.a = 1;
p.b = 2;
p.c = 30;
delete p.b;
const q = {};
q.a = 1;
q.b = 2;
q.c = 31;
delete q.b;
console.log(read(p));
console.log(read(q));

// A frozen property is non-configurable, and an ES module is always strict — which is where the
// spec's `delete` raises rather than answering false (the runtime answer bucket 2704 waited for).
/** @type {{ x?: number }} */
const frozen = Object.freeze({ x: 1 });
try {
  delete frozen.x;
} catch (e) {
  console.log(e.name + ': ' + e.message);
  console.log(e instanceof TypeError);
}
// ...but a key it never had is still `true`: [[Delete]] of an absent property succeeds.
console.log(delete frozen.nope);
console.log(frozen.x);
