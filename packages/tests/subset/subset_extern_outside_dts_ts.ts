// @mode: ts
// @verdict: error
// @code: STA1121
// SUBSET.md: FFI — extern declaration outside a `.d.ts` (docs/FFI.md section 1.3: keeps Task
// 7.3's generator output a drop-in and the trust boundary greppable). The marker below sits
// in the entry file, which IS the violation; it stays inline by design — moving it into a
// helper would dissolve the fixture.
/** @statorExtern */
declare function cDouble(x: number): number;

console.log(cDouble(21));
export {};
