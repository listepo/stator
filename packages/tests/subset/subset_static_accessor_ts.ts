// @mode: ts
// @verdict: static
// SUBSET.md: Classes with getters/setters
// A static accessor is a pair of plain functions under mangled static bindings: reading
// `C.value` runs the getter, writing it runs the setter.

class C {
  static val: number = 0;
  static get value(): number {
    return C.val;
  }
  static set value(v: number) {
    C.val = v;
  }
}
C.value = 41;
C.value += 1;
export const x = C.value;
