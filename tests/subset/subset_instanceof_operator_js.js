// @mode: js
// @verdict: static
// SUBSET.md: instanceof operator

class C {}
const x = new C();
const b = x instanceof C;
console.log(b);
