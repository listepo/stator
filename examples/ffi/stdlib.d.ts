// stdlib.d.ts — manual binding for `free(3)`, the deallocator half
// (plan.md §10 Task 7.3 step 1).
//
// Shape covered: the function every allocating binding needs but no binding
// can use yet — `free` takes an opaque pointer, and opaque pointers defer
// to step 6 (STA1217). Proves the companion-free rule (docs/FFI.md §3)
// terminates in a real declaration, and records why the allocating half
// (`malloc` family) stays refused. The file is one declaration plus
// refusals: the allocator family cannot be named (no `void*` row), so the
// deallocator stands alone until step 6.
//
// VERIFIED against headers: the Xcode SDK `usr/include/malloc/_malloc.h`
// (MacOSX.sdk — `malloc` :54, `calloc` :55, `free` :56, `realloc` :57,
// `posix_memalign` :68). Size/state annotations (`__sized_by_or_null`,
// `_MALLOC_TYPED`) are static-analysis attributes, not signature — the
// binding reads past them. `free(void *)` is the only declaration below;
// the rest is refused in comments, not approximated (docs/FFI.md §2;
// Task 7.3 step 5).
//
// Build: libc, no extra link flag. No link-pragma spelling exists yet
// (Task 7.1 step 7 unstarted) — see NOTES.md ("no link pragma").

// Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md §3).
// Unused in this binding (`free` takes no strings); repeated here so the
// file is a drop-in without cross-file references.
type CString = string & { readonly __statorCstr: "CString" };

/** Opaque heap block (`void*`). Lifetime belongs to the C allocator: born
 *  in `malloc` / `calloc` / `realloc` / `strdup` (all refused below — v0
 *  cannot name a `void*` return), died in `cFree`. Generated code never
 *  dereferences it (docs/FFI.md §2). `free` is also the first binding
 *  whose C parameter is `void*`: the TS side cannot spell `void*` (no ABI
 *  row), so the binding names the ownership instead — this brand. */
type HeapBlock = { readonly __brand: "heap_block" };

// --- The deallocator. ---
//
// Ownership: `ptr` is CONSUMED — after a successful `free` the TS-side
// `HeapBlock` value is dangling, and nothing stops its reuse (same unstated
// consume rule as `sqliteClose`; see NOTES.md "double free"). `free(NULL)`
// is a no-op per C, so the benign null case needs no guard — though v0 has
// no nullable-handle spelling if one were ever wanted.
// Error convention: none — `free` returns `void` and reports no failure.
// That `void` is the genuine C `void` return, not a discarded value: the
// "unmapped nonzero must not be silently discarded" absolute (docs/FFI.md
// §4) refuses value-to-`void` mappings, and this is not one.
// Gate fate: DEFERRED. A branded pointer is a table type whose lowering is
// step 6's, so the landed gate refuses this declaration with not-yet
// STA1217, not a never-code (see NOTES.md "deferred free").

/** @statorExtern free */
declare function cFree(ptr: HeapBlock): void;

// ============================================================================
// REFUSED (v0 scope; recorded, not approximated — Task 7.3 step 5).
// Each entry names the construct and the header line it comes from, which is
// what the future generator must emit as a diagnostic.
// ============================================================================
//
// 1. `malloc(size)` (_malloc.h:54) — `void*` return: no ABI-table row
//    (STA1119 catch-all). Zero-initialization questions do not arise; the
//    return type alone refuses it.
// 2. Any allocator returning `CStringOwned` (e.g. `malloc` spelled as
//    `(): CStringOwned`) — `CStringOwned` is parameter-only (docs/FFI.md
//    §3): STA1119, refused at the return-position arm. There is no
//    allocator-return spelling in v0: owned-out is not transferred-in
//    (see NOTES.md "allocator returns").
// 3. `calloc(count, size)` (_malloc.h:55) — same `void*` return: STA1119.
//    The two-argument (count × size) shape is expressible (`number`,
//    `number`); the return is not. Zero-initialization changes nothing
//    about expressibility.
// 4. `realloc(ptr, size)` (_malloc.h:57) — `void*` in AND out: the argument
//    needs the same opaque spelling `free` uses (deferred, STA1217) while
//    the return needs a row that does not exist (STA1119). Doubly refused;
//    in-place growth vs move is a C-side detail the binding cannot see.
// 5. `posix_memalign(memptr, alignment, size)` (_malloc.h:68) —
//    `void **memptr` is a `T**` out-param: STA1119 (docs/FFI.md §2, open
//    item §7.4; same rule as the SQLite constructor refusals). The `int`
//    error return would be `@statorError nonzero`-shaped, but the out-param
//    refuses first — one signature, one diagnostic, parameters left to
//    right (gate order).
//
// OMITTED, same `void*` rule as refusals 1–4 (not re-recorded per symbol):
// `reallocf`, `valloc`, `aligned_alloc` (all `void*` returns), and the
// `malloc_type_*` backdeploy wrappers (`_malloc.h:71+` — the same signatures
// through a type-tagged inline layer; out of scope twice over).
