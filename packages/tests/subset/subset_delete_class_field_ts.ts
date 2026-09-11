// @mode: ts
// @verdict: error
// @code: STA1108
// SUBSET.md: delete on class field (instance or static)

class C {
  x: number = 42;
}
const c = new C();
delete c.x;
export { c };
