// plan.md §8 step 12(d): read-modify-write on an accessor in js mode.

class C {
  constructor() {
    this.val = 0;
  }
  get value() {
    return this.val;
  }
  set value(v) {
    this.val = v;
  }
}

let calls = 0;
function getC(c) {
  calls += 1;
  return c;
}

const c = new C();
c.value += 1;
c.value++;
++c.value;
c.value -= 2;
console.log(c.value);
console.log(c.val);
