// Reading a name a class never declared (plan.md §8 step 37): js mode suppresses the
// checker's TS2339, so the read resolves through the receiver's own descriptor at run time
// and answers undefined — including for a subclass value's added field.
class C {
  a = 1;
}
const c = new C();
console.log(c.missing);
console.log(typeof c.missing);
console.log(c.a);

class D extends C {
  extra = 42;
}
const d = new D();
console.log(d.extra);

// Through an untyped parameter the receiver's own layout answers: a subclass value's
// added field resolves, a base value misses to undefined.
function readAny(x) {
  return x.missing;
}
console.log(readAny(d));
console.log(readAny(c));
