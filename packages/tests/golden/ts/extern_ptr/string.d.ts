// Real libc memory verbs behind the header pragma (docs/FFI.md section 9): `<string.h>`'s
// true prototypes govern — `memset` fills caller-owned bytes, `memcmp` reads them back, and
// only the comparison's SIGN crosses back (an `int` return has no exact ABI spelling, so the
// golden asserts `0` and `< 0`, both of which the C standard pins down).

// @statorLink #include <string.h>

/// <reference path="./ptr.d.ts" />

/** @statorExtern memset */
declare function sysSet(block: Mem, value: number, size: number): Mem;

/** @statorExtern memcmp */
declare function sysCmp(a: Mem, b: Mem, size: number): number;
