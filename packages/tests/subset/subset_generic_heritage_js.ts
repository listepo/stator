// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — extending a generic class needs the base's substituted layout
// threaded through the ancestry the type model builds once per declaration; the subclass
// side (a generic class extending an ordinary one) compiles today.

class Box<T> {
  value: T | undefined = undefined;
}
class Sub extends Box<number> {
  w: number = 0;
}
console.log(new Sub().w);
