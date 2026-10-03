// @mode: js
// @verdict: dynamic
// SUBSET.md: classes with fixed shape (a name the class never declared grows the overflow table)
class C {
  a = 1;
}
const c = new C();
c.missing = 2;
console.log(c.missing);
