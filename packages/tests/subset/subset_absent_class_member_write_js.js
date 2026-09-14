// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: classes with fixed shape (growing a fixed layout waits on Phase 8)
class C {
  a = 1;
}
const c = new C();
c.missing = 2;
