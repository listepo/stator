// plan.md §8 step 12(d): static `#private` accessors lower like public ones -- a pair of
// plain functions under mangled static bindings -- except each class owns its pair
// (`C.get #x` vs `D.get #x`), so a re-declaration is independent storage.

class C {
  static #v: number = 0;
  static get #x(): number {
    return C.#v;
  }
  static set #x(v: number) {
    C.#v = v;
  }
  static run(): number {
    C.#x = 3;
    C.#x += 10;
    C.#x++;
    return C.#x;
  }
}

class D extends C {
  static #w: number = 100;
  static get #x(): number {
    return D.#w;
  }
  static set #x(v: number) {
    D.#w = v;
  }
  static runD(): number {
    D.#x = 7;
    return D.#x;
  }
}

console.log(C.run());
console.log(D.runD());
console.log(C.run());
