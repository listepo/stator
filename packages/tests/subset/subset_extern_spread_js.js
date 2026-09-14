// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — spread argument to an extern call, from untyped code. The arity is a
// property of the C call, so the refusal is the same error in both modes.
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extSqrt(...[4]));
