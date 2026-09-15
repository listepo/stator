// plan.md §8 step 12(d): declared-but-uninitialized fields in js mode.
// A field with no initializer defaults its slot to `undefined`, matching Node.

class C {
  x;
  y = 5;
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
