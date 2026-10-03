// Shared declaration for the subset_extern_bytesret_* decision fixtures (docs/FFI.md section 2
// `Uint8Array` row): a view as a RETURN. A returned buffer would need an owner and a length the C
// signature cannot carry, so the row is parameter-only and the return is the table's catch-all.

/** @statorExtern bytes_make */
declare function extMake(n: number): Uint8Array;
