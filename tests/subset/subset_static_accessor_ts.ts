// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes with getters/setters
// A static accessor belongs to the class OBJECT, which this subset does not build: a static is one
// plain binding, and a binding has no place to hang a pair of functions.

class C {
  static val: number = 0;
  static get value(): number {
    return C.val;
  }
}
export const x = C.value;
