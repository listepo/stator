// @mode: ts
// @verdict: static
// SUBSET.md: Private fields

class C {
  #field: number = 0;
  #bump(): number {
    this.#field += 1;
    return this.#field;
  }
  get(): number {
    return this.#bump();
  }
}
export const c = new C().get();
