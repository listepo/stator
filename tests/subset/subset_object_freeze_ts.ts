// @mode: ts
// @verdict: static
// SUBSET.md: Object.freeze / Object.isFrozen

class C {
  x: number = 1;
}
const o = new C();
Object.freeze(o);
console.log(Object.isFrozen(o));
