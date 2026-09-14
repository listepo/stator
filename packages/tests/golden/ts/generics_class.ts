// Generic classes (plan.md §8 step 12(f)): one descriptor per concrete tuple at each
// `new` site, inferred or explicit; fields, methods, accessors and statics substitute.

class Box<T> {
  value: T;
  constructor(v: T) {
    this.value = v;
  }
  get(): T {
    return this.value;
  }
}
console.log(new Box<number>(42).get());
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
console.log(new Counter<boolean>(true).value);

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

class Over {
  m(): string {
    return "base-m";
  }
}
class OverSub<T> extends Over {
  v: T;
  constructor(x: T) {
    super();
    this.v = x;
  }
  override m(): string {
    return "sub-m";
  }
}
console.log(new OverSub<number>(1).m());
console.log(new Over().m());

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

function firstBox<T>(b: Box<T>): T {
  return b.value;
}
console.log(firstBox(new Box(5)));
