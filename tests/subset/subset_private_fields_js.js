// @mode: js
// @verdict: dynamic
// SUBSET.md: Private fields

class C {
  #field;
  #store(v) {
    this.#field = v;
    return this.#field;
  }
  get(v) {
    return this.#store(v);
  }
}
export const c = new C().get(1);
