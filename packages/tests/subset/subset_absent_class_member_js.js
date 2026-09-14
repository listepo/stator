// @mode: js
// @verdict: dynamic
// SUBSET.md: classes with fixed shape (absent member read answers undefined)
class C {
  a = 1;
}
const c = new C();
console.log(c.missing);
console.log(typeof c.missing);
