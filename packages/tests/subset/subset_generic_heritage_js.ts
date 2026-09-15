// @mode: js
// @verdict: dynamic
// SUBSET.md: Generics — a non-generic class extending a generic base with explicit,
// fully concrete arguments grounds the base's layout once: the subclass reads the
// substituted fields and methods through the tuple's specialization. Dynamic here only
// because the inherited `value: T | undefined` field is a union with no HType.

class Box<T> {
  value: T | undefined = undefined;
}
class Sub extends Box<number> {
  w: number = 0;
}
console.log(new Sub().w);
