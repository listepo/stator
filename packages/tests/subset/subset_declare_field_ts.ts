// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// `declare x: T` is erased -- no define, no slot -- yet its type still claims a value: a read would be
// `undefined` under a type that says otherwise (plan-notes 233).

class C {
  declare v: number;
}
export const x = new C().v;
