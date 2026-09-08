// @mode: js
// @verdict: not-yet
// @code: STA1205
// @expected-fail: true
// SUBSET.md: delete on class field (instance or static)

class C {
  constructor() {
    this.x = 42;
  }
}
const c = new C();
delete c.x;
export { c };
