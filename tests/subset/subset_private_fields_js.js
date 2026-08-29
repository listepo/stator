// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Private fields

class C {
  #field = 0;
  get() {
    return this.#field;
  }
}
export const c = new C();
