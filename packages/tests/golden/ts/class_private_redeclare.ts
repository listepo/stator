// plan.md §8 step 12(d): a `#private` name re-declared in a subclass is independent storage.
// Each declaring class gets its own slot (`#x@A` vs `#x@B`), so ancestor and descendant reads
// and writes never meet -- in either direction. Brands stay lexical too: `#x in o` in `A`
// asks for `A`, in `B` for `B`.

class A {
  #x: number = 1;
  readA(): number {
    return this.#x;
  }
  writeA(v: number): void {
    this.#x = v;
  }
  hasA(o: object): boolean {
    return #x in o;
  }
  #m(): number {
    return 1;
  }
  callM(): number {
    return this.#m();
  }
}

class B extends A {
  #x: number = 2;
  readB(): number {
    return this.#x;
  }
  writeB(v: number): void {
    this.#x = v;
  }
  hasB(o: object): boolean {
    return #x in o;
  }
  #m(): number {
    return 2;
  }
  callM2(): number {
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
