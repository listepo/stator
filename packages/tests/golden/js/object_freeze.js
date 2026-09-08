// js-column twin of ts/object_freeze.ts: Object.freeze/isFrozen over a class
// instance and a dynamic object, with writes throwing a catchable TypeError.
class C {
  constructor() {
    this.x = 1;
  }
}
const o = new C();
Object.freeze(o);
console.log(Object.isFrozen(o));
try {
  o.x = 2;
} catch {
  console.log("threw");
}
console.log(o.x);

const d = { y: 1 };
Object.freeze(d);
console.log(Object.isFrozen(d));
try {
  d.y = 2;
} catch {
  console.log("threw");
}
console.log(d.y);
