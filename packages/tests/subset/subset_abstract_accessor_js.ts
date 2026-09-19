// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- abstract members declare, a subclass implementation runs
// (plan.md §8 step 12(d), plan-notes 275). Same source as subset_abstract_accessor_ts:
// a `.ts` file under js mode gets the same static treatment, and `abstract` is twice
// unavailable to untyped code (a `.js` file cannot spell the modifier). Abstract
// accessors stay not-yet in both modes (accessor dispatch is direct).

abstract class Base {
  abstract get x(): number;
  abstract set x(v: number);
}
class Sub extends Base {
  n: number = 3;
  override get x(): number {
    return this.n;
  }
  override set x(v: number) {
    this.n = v;
  }
}
export const s: Base = new Sub();
export const a = s.x;