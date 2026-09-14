// @mode: ts
// @verdict: static
// SUBSET.md: Generics — a generic class specializes per concrete tuple at each `new`
// site, inferred or explicit; fields, methods, accessors and statics substitute with it.

class Box<T> {
  value: T;
  constructor(v: T) {
    this.value = v;
  }
  get(): T {
    return this.value;
  }
}
const b = new Box<number>(42);
console.log(b.get());
console.log(new Box("s").get());

class Counter<T> {
  static count: number = 0;
  value: T;
  constructor(v: T) {
    this.value = v;
  }
  static make(): number {
    return 7;
  }
}
console.log(Counter.make());
console.log(Counter.count);
const c = new Counter<boolean>(true);
console.log(c.value);

class Base {
  describe(): string {
    return "base";
  }
}
class Derived<T> extends Base {
  item: T;
  constructor(x: T) {
    super();
    this.item = x;
  }
  read(): T {
    return this.item;
  }
}
const d = new Derived<string>("x");
console.log(d.read());
console.log(d.describe());

class WithAccess<T> {
  inner: T;
  constructor(v: T) {
    this.inner = v;
  }
  get x(): T {
    return this.inner;
  }
  set x(v: T) {
    this.inner = v;
  }
}
const w = new WithAccess<number>(1);
w.x = 2;
console.log(w.x);
