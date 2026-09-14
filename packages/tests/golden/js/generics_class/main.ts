// js-mode twin of `ts/generics_class.ts`: the same specializations under `--mode=js`.

class Box<T> {
  value: T;
  constructor(v: T) {
    this.value = v;
  }
  get(): T {
    return this.value;
  }
}
console.log(new Box<number>(43).get());
console.log(new Box("t").get());

class Base {
  describe(): string {
    return "base2";
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
const d = new Derived<number>(9);
console.log(d.read());
console.log(d.describe());
