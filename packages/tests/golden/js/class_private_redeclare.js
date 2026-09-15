// plan.md §8 step 12(d): a `#private` name re-declared in a subclass is independent storage
// on the dynamic path too -- an untyped slot per declaring class, read and written lexically.

class A {
  #x = 1;
  readA() {
    return this.#x;
  }
  writeA(v) {
    this.#x = v;
  }
  hasA(o) {
    return #x in o;
  }
  #m() {
    return 1;
  }
  callM() {
    return this.#m();
  }
}

class B extends A {
  #x = 2;
  readB() {
    return this.#x;
  }
  writeB(v) {
    this.#x = v;
  }
  hasB(o) {
    return #x in o;
  }
  #m() {
    return 2;
  }
  callM2() {
    return this.#m();
  }
}

const b = new B();
console.log(b.readA());
console.log(b.readB());
b.writeA(10);
console.log(b.readA());
console.log(b.readB());
b.writeB(20);
console.log(b.readA());
console.log(b.readB());
console.log(b.callM());
console.log(b.callM2());
console.log(b.hasA(b));
console.log(b.hasB(b));
const a = new A();
console.log(a.readA());
console.log(a.callM());
console.log(b.hasA(a));
console.log(b.hasB(a));
