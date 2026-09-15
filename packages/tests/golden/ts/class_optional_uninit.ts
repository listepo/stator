// plan.md §8 step 12(d): uninitialized optional fields.
// The slot defaults to `undefined` (every slot starts undefined in `jsrt_object_new`),
// which is what Node's define-semantics answers: the property is present (`"x" in c`),
// inspect shows it, and each instance gets its own.

class C {
  x?: number;
  y?: number = 5;
}

const c = new C();
console.log(c.x);
c.x = 7;
console.log(c.x);
const d = new C();
console.log(d.x);
d.x = 9;
console.log(c.x);
console.log(d.x);
console.log(c.y);
console.log('x' in c);
console.log(c);
