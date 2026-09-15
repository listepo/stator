// plan.md §8 step 12(d): static `#private` accessors on the dynamic path -- an untyped
// backing slot per class, with the getter/setter pair reached by static binding name.

class C {
  static #v = 0;
  static get #x() {
    return C.#v;
  }
  static set #x(v) {
    C.#v = v;
  }
  static run() {
    C.#x = 3;
    C.#x += 10;
    C.#x++;
    return C.#x;
  }
}

class D extends C {
  static #w = 100;
  static get #x() {
    return D.#w;
  }
  static set #x(v) {
    D.#w = v;
  }
  static runD() {
    D.#x = 7;
    return D.#x;
  }
}

console.log(C.run());
console.log(D.runD());
console.log(C.run());
