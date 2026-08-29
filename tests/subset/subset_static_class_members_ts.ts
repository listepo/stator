// @mode: ts
// @verdict: static
// SUBSET.md: Static methods and static class members

class C {
  static count: number = 0;
  static increment(): void {
    C.count++;
  }
}
class D extends C {}

C.increment();
console.log(C.count);
console.log(D.count);
