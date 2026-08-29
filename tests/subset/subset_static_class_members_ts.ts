// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Static methods and static class members

class C {
  static count: number = 0;
  static increment(): void {
    C.count++;
  }
}
export const n = C.count;
