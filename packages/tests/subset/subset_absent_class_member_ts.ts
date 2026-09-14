// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: classes with fixed shape (absent member read)
class C {
  a = 1;
}
const c = new C();
console.log(c.missing);
