// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes with getters/setters

class C {
  static val = 0;
  static get value() {
    return C.val;
  }
}
export const x = C.value;
