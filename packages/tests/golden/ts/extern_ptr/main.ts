// Opaque pointers round-tripped borrow-only (docs/FFI.md, plan.md section 10 Task 7.1
// steps 6–7): a sentinel handle through the two-function fixture C the harness compiles
// itself (plan §10 step 10 — no header, `void *` forward declarations), and two malloc'd
// blocks through real libc (header pragmas, so the true `size_t` prototypes govern). The
// output proves the round-trip: identity through custom C, byte-equality through memset +
// memcmp, and every block freed by its owner before exit.
/// <reference path="./ptr.d.ts" />
/// <reference path="./stdlib.d.ts" />
/// <reference path="./string.d.ts" />

console.log(ptrCheck(ptrMake()));
const a = sysAlloc(64);
const b = sysAlloc(64);
sysSet(a, 65, 64);
sysSet(b, 65, 64);
console.log(sysCmp(a, b, 64));
sysSet(b, 66, 1);
console.log(sysCmp(a, b, 64) < 0);
sysFree(a);
sysFree(b);
export {};
