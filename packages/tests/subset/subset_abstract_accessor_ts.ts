// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- abstract members declare, a subclass implementation runs
// (plan.md §8 step 12(d), plan-notes 275). Abstract METHODS landed via throw-stubs
// with virtual dispatch; abstract ACCESSORS stay not-yet, refused twice over: the
// base's bodiless pair hits the bodiless-accessor arm (`an accessor with no body`),
// and the subclass override hits the override arm
// (`overriding the inherited member 'x'`) -- an accessor read dispatches `direct`
// (`accessorCall` in lower/index.ts) while methods virtualize, so a subclass
// override cannot land on a base-typed read without virtual accessor dispatch,
// which is its own slice.

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