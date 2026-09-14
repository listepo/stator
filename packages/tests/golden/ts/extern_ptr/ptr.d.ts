// Opaque-handle brands and the headerless declarations (docs/FFI.md sections 2, 9). The
// brands live here once, and the header-bearing bindings reference this file instead of
// redeclaring them — one declaration, three binding files. The C file beside this one
// defines both functions, and the emitter declares them from the ABI kinds (`void *` where
// the handle crosses): no pragma, no flags — a self-contained symbol never needs step 7's
// plumbing, and the two `void *` spellings agree at the ABI level.

/** An opaque handle owned by the C library, never dereferenced by generated code. */
type PtrBox = { readonly __brand: "PtrBox" };

/** An opaque handle owned by the C library, never dereferenced by generated code. */
type Mem = { readonly __brand: "Mem" };

/** @statorExtern ptr_make */
declare function ptrMake(): PtrBox;

/** @statorExtern ptr_check */
declare function ptrCheck(box: PtrBox): number;
