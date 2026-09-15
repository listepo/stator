// @mode: ts
// @verdict: static
// SUBSET.md: Private fields
// A static #private accessor is a pair of plain functions under mangled static bindings, one
// pair per declaring class: reading `C.#x` runs the getter, writing it runs the setter. (The
// use stays inside the class body: a `#private` name is not accessible outside it.)

class C {
  static #v: number = 0;
  static get #x(): number {
    return C.#v;
  }
  static set #x(v: number) {
    C.#v = v;
  }
  static bump(): number {
    C.#x = 41;
    C.#x += 1;
    return C.#x;
  }
}
export const x = C.bump();
