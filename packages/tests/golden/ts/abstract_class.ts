// Abstract classes: the base declares, the subclass implements. A three-level chain
// with a middle abstract class, an abstract property, base-typed reads, an inherited
// concrete method, statics, and instanceof (plan.md §8 step 12(d), plan-notes 275).
abstract class A {
  abstract m(): number;
  n: number = 5;
  static s: number = 7;
  tag: string = 't';
}
abstract class B extends A {
  abstract override m(): number;
}
class C extends B {
  override m(): number {
    return this.n + A.s;
  }
}
const c: A = new C();
console.log(c.m());
console.log(c.tag);
console.log(c instanceof A);
console.log(c instanceof B);
console.log(new C().m());
