// @mode: js
// @verdict: dynamic
// SUBSET.md: Private fields
// A #private accessor and the brand check in js mode.

class C {
  constructor() {
    this.#v = 0;
  }
  #v;
  get #x() {
    return this.#v;
  }
  set #x(v) {
    this.#v = v;
  }
  run() {
    this.#x = 3;
    return this.#x;
  }
  has(o) {
    return #x in o;
  }
}

const c = new C();
export const x = c.run();
export const y = c.has(c);
