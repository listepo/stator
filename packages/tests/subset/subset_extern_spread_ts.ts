// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — spread argument to an extern call. A spread's count is not its arity, and
// a C call's arity is exact — there is no tuple form to spread into (docs/FFI.md section 2).
// The tuple spelling keeps the checker quiet so the gate's own refusal is what the verdict
// pins.
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extSqrt(...([4] as [number])));
export {};
