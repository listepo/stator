// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: FFI — untagged ambient declaration: no `@statorExtern` marker, so there is no
// extern surface to classify. The bodiless declaration falls into gateFunction's shared
// bodiless arm, which reports STA1214 (under the overload-signatures message); the direct
// call itself is ordinary and accepted.
declare function cUntagged(x: number): number;

console.log(cUntagged(1));
export {};
