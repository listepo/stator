// Real libc allocation behind the header pragma (docs/FFI.md section 9): the emitted
// forward declaration is skipped for this file, so `<stdlib.h>`'s true prototypes govern —
// `void *malloc(size_t)`, `void free(void *)` — and the caller's `double` arguments convert
// implicitly, which is defined where calling through a mismatched prototype would not be.

// @statorLink #include <stdlib.h>

/// <reference path="./ptr.d.ts" />

/** @statorExtern malloc */
declare function sysAlloc(size: number): Mem;

/** @statorExtern free */
declare function sysFree(block: Mem): void;
