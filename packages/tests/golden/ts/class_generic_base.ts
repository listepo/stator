// A non-generic class extending a generic base (plan.md §8 step 12(d)/(f)): the subclass
// names one complete tuple, so the base's layout is grounded once and the descriptor, the
// inherited-method owner, the vtable and the super-call all name that tuple's specialization.

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
  override describe(): string {
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
