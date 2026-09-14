// plan.md §8 step 12(d): read-modify-write on an instance accessor in statement position.
// Each form is one get and one set; a side-effecting receiver runs exactly once.

class C {
  val: number = 0;
  get value(): number {
    return this.val;
  }
  set value(v: number) {
    this.val = v;
  }
}

let calls = 0;
function getC(c: C): C {
  calls += 1;
  return c;
}

const c = new C();
c.value += 1;
c.value++;
++c.value;
c.value -= 2;
getC(c).value += 10;
for (let i = 0; i < 2; i++) {
  c.value += 100;
}
console.log(c.value);
console.log(c.val);
console.log(calls);
