// js-mode twin of `ts/class_generic_base.ts`: the same grounded base layout under `--mode=js`
// (no `override` modifier — js mode leaves `noImplicitOverride` off).

class Box<T> {
  static kind: string = "box";
  value: T;
  constructor(v: T) {
    this.value = v;
  }
  get(): T {
    return this.value;
  }
  describe(): string {
    return "box";
  }
}
class Sub extends Box<number> {
  w: number = 0;
  constructor(v: number, w: number) {
    super(v);
    this.w = w;
  }
  describe(): string {
    return "sub";
  }
  sum(): number {
    return this.get() + this.w;
  }
}
const s = new Sub(40, 2);
console.log(s.sum());
console.log(s.describe());
console.log(new Sub(1, 2).get());
console.log(Sub.kind);
console.log(s instanceof Sub);
function first(b: Box<number>): number {
  return b.get();
}
console.log(first(s));
console.log(new Box<string>("hi").get());
