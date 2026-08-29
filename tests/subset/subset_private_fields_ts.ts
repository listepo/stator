// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Private fields

class C {
  #field: number = 0;
  get(): number {
    return this.#field;
  }
}
export const c = new C();
