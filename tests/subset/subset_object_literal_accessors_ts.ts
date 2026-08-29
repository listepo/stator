// @mode: ts
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Getters/setters on object literals

export const obj = {
  val: 0,
  get value(): number {
    return this.val;
  },
  set value(v: number) {
    this.val = v;
  }
};
