// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: arithmetic operators (ToPrimitive runs user code: Phase 8)
class C {
  a = 1;
}
const c = new C();
console.log(c * 1);
