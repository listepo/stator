// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: classes with fixed shape (growing a fixed layout waits on Phase 8)
class C {
  a = 1;
}
const c = new C();
c.missing = 2;
