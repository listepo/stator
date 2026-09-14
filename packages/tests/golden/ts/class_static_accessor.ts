// plan.md §8 step 12(d): static getters and setters.
// A static accessor is a pair of plain functions under mangled static bindings, reached by
// name -- so a subclass reads its base's pair.

class C {
  static val: number = 0;
  static get value(): number {
    return C.val;
  }
  static set value(v: number) {
    C.val = v;
  }
}

class D extends C {}

C.value = 41;
C.value += 1;
C.value++;
console.log(C.value);
console.log(C.val);
console.log(D.value);
D.value = 100;
console.log(C.value);
