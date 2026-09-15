// Struct-by-pointer step-1 example (plan.md §10 Task 7.3 step 1): field reads
// through the demo-local accessor shim (`stat_shim.d.ts`), never through a
// struct spelling v0 does not have. Deterministic: `run.ts` prepares
// `data.bin` (fixed bytes, fixed mtime) in a scratch directory and runs both
// sides with it as the working directory, so the relative path resolves on
// both and the outputs agree byte-for-byte, including the -1 missing-file
// path.
// oxlint-disable-next-line typescript/triple-slash-reference -- STA1121 keeps extern bindings in a .d.ts; import style cannot carry the ambient extern declaration (bench/programs/ffi-sqrt.ts spelling).
/// <reference path="./stat_shim.d.ts" />

console.log(statSize('data.bin' as CString));
console.log(statMtime('data.bin' as CString));
console.log(statSize('no-such-file' as CString));
// oxlint-disable-next-line unicorn/require-module-specifiers -- marks the entry a module (the golden extern fixtures' spelling); there is nothing to export.
export {};
