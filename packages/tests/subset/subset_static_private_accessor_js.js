// @mode: js
// @verdict: static
// SUBSET.md: Private fields
// A static #private accessor is a pair of plain functions under mangled static bindings, one
// pair per declaring class: reading `C.#x` runs the getter, writing it runs the setter. (The
// use stays inside the class body: a `#private` name is not accessible outside it.)

class C {
  static #v = 0;
  static get #x() {
    return C.#v;
  }
  static set #x(v) {
    C.#v = v;
  }
  static bump() {
    C.#x = 41;
    C.#x += 1;
    return C.#x;
  }
}
export const x = C.bump();
