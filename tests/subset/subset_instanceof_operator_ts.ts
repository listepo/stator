// @mode: ts
// @verdict: static
// SUBSET.md: instanceof operator

class C {}
const x = new C();
const b: boolean = x instanceof C;
console.log(b);
