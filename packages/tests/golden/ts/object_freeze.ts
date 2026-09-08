class C {
  x: number = 1;
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

const d: { y?: number } = { y: 1 };
Object.freeze(d);
console.log(Object.isFrozen(d));
try {
  d.y = 2;
} catch {
  console.log("threw");
}
console.log(d.y);
