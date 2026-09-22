// @mode: ts
// @verdict: static
// SUBSET.md: Classes with getters/setters
// An accessor override keeps its slot and takes over the entry: get-only over get-only,
// set-only over set-only, pair over pair. Each half dispatches on the receiver's runtime
// class, so a base-typed read or write runs the override (plan.md §8 step 12(d)). The
// checker's variance rules stay the checker's (get covariant, set contravariant).

class Base {
  raw: number = 0;
  get value(): number {
    return this.raw;
  }
  set value(v: number) {
    this.raw = v;
  }
  get label(): string {
    return 'base';
  }
  set only(v: number) {
    this.raw = v;
  }
}
class Derived extends Base {
  override get value(): number {
    return this.raw * 2;
  }
  override set value(v: number) {
    this.raw = v + 1;
  }
  override get label(): string {
    return 'derived';
  }
  override set only(v: number) {
    this.raw = v * 10;
  }
}
const b: Base = new Derived();
b.value = 4;
export const x = b.value + b.label.length;
b.only = 2;
export const y = b.value;
