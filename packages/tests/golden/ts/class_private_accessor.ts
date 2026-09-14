// plan.md §8 step 12(d): #private accessors and the #brand-in-object test.
// An accessor is a member function under a mangled name; a brand check is an `instanceof`
// against the declaring class, so a subclass instance carries its base's brand.

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
    this.#x += 10;
    return this.#x;
  }
  has(o: object): boolean {
    return #x in o;
  }
}

class D extends C {}

const c = new C();
console.log(c.run());
console.log(c.has(c));
console.log(c.has({}));
console.log(c.has(new D()));
