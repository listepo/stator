// plan.md §8 step 12(d): static getters and setters in js mode.

class C {
  static val = 0;
  static get value() {
    return C.val;
  }
  static set value(v) {
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
