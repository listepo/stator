// @mode: js
// @verdict: dynamic
// SUBSET.md: Classes with getters/setters
// The untyped twin: an accessor override in JavaScript, each half dispatched on the
// receiver's runtime class through a JSDoc-typed base reference (plan.md §8 step 12(d)).

class Base {
  constructor() {
    this.raw = 0;
  }
  get value() {
    return this.raw;
  }
  set value(v) {
    this.raw = v;
  }
  get label() {
    return 'base';
  }
  set only(v) {
    this.raw = v;
  }
}
class Derived extends Base {
  get value() {
    return this.raw * 2;
  }
  set value(v) {
    this.raw = v + 1;
  }
  get label() {
    return 'derived';
  }
  set only(v) {
    this.raw = v * 10;
  }
}
/** @param {Base} b */
function run(b) {
  b.value = 4;
  const x = b.value + b.label.length;
  b.only = 2;
  return x + b.value;
}
export const out = run(new Derived());
