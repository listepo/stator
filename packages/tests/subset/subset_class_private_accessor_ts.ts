// @mode: ts
// @verdict: dynamic
// SUBSET.md: Private fields
// A #private accessor is a member function under a mangled name, exactly as a public accessor
// is. The brand check `#x in o` is an `instanceof` against the declaring class.

class C {
  #v: number = 0;
  get #x(): number {
    return this.#v;
  }
  set #x(v: number) {
    this.#v = v;
  }
  run(): number {
    this.#x = 3;
    return this.#x;
  }
  has(o: object): boolean {
    return #x in o;
  }
}

const c = new C();
export const x = c.run();
export const y = c.has(c);
