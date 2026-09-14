// @mode: js
// @verdict: static
// SUBSET.md: Classes with getters/setters
// A static accessor is a pair of plain functions under mangled static bindings: reading
// `C.value` runs the getter, writing it runs the setter.

class C {
  static val = 0;
  static get value() {
    return C.val;
  }
  static set value(v) {
    C.val = v;
  }
}
C.value = 41;
C.value += 1;
export const x = C.value;
