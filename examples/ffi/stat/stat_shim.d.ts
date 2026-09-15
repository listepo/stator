// stat_shim.d.ts — the documented v0 pattern for READING struct fields
// (plan.md §10 Task 7.3 step 1; NOTES.md "stat offsets"): the binding never
// spells `struct stat` — it declares the shim's scalar accessors, and the
// `@statorLink` header pragma points the prologue at the shim header (quote
// form with a `/`, resolved against this file, so the absolute include works
// wherever the checkout sits). The shim `.c` beside the example compiles
// through the fixture-C path and links through `--link=` (see run.ts).
//
// Field offsets stay in C, where the platform compiler derives them: the
// binding cannot guess them (this box's `struct stat` is the conditional
// `__DARWIN_STRUCT_STAT64`), and v0 has no `offsetof`-derived glue yet.

// @statorLink #include "./stat_shim.h"

// Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md §3).
type CString = string & { readonly __statorCstr: 'CString' };

// Ownership: `path` is a `CString` borrow (freed after return; the callee
// retains nothing). Both returns are `number` copies; nothing is allocated.
// Error convention: none — a missing file is -1, DATA the caller compares
// (the multi-code-returns-are-values rule, NOTES.md "step codes"). int64
// fields cross as `double`: exact for every real file, stated here, never a
// silent 64-bit widening through the ABI table.

/** @statorExtern stat_size */
declare function statSize(path: CString): number;

/** @statorExtern stat_mtime */
declare function statMtime(path: CString): number;
