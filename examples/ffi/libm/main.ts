// libm step-1 example (plan.md §10 Task 7.3 step 1): the scalar-only shape from
// `../libm.d.ts` running for real — `number` in, `number` out, no allocation, no
// lifetime, no error convention. Deterministic: IEEE doubles print identically on
// both sides (Ryū shortest-round-trip vs Node), including the NaN domain-error
// path (NOTES.md "math domain errors": absent `@statorError` means NaN is data).
// oxlint-disable-next-line typescript/triple-slash-reference -- STA1121 keeps extern bindings in a .d.ts; import style cannot carry the ambient extern declaration (bench/programs/ffi-sqrt.ts spelling).
/// <reference path="../libm.d.ts" />

console.log(libmSqrt(2));
console.log(libmSqrt(0));
console.log(libmFmod(5.5, 2));
console.log(libmPow(2, 10));
console.log(libmFabs(-3.5));
console.log(libmFloor(3.7));
console.log(libmSqrt(-1));
// oxlint-disable-next-line unicorn/require-module-specifiers -- marks the entry a module (the golden extern fixtures' spelling); there is nothing to export.
export {};
