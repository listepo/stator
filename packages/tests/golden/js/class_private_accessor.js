// plan.md §8 step 12(d): #private accessors and the brand check in js mode.

class C {
  #v;
  constructor() {
    this.#v = 0;
  }
  get #x() {
    return this.#v;
  }
  set #x(v) {
    this.#v = v;
  }
  run() {
    this.#x = 3;
    this.#x += 10;
    return this.#x;
  }
  has(o) {
    return #x in o;
  }
}

class D extends C {}

const c = new C();
console.log(c.run());
console.log(c.has(c));
console.log(c.has({}));
console.log(c.has(new D()));
