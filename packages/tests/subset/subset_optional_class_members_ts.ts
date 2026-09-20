// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// `x?: T` is a plain slot holding `undefined` from birth; `m?() {}` is an ordinary method; `m?(): T`
// with no body is no member at all, so a read is `undefined` and `o.m?.()` never calls
// (plan-notes 233). Dynamic because an optional member reads as `T | undefined`, a union, as an
// optional object-literal property does.

class Opts {
  label?: string;
  size = 1;
  describe?(): string {
    return `size ${this.size}`;
  }
  hook?(): void;
}
const o = new Opts();
export const x = o.label ?? o.describe?.() ?? 'none';
export const y = o.hook === undefined;
