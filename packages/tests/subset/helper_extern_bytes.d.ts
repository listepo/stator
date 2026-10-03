// Shared declarations for the subset_extern_bytes_* decision fixtures (docs/FFI.md section 2
// `Uint8Array` row, plan.md section 11c T11.3a): a view crosses as its own bytes plus its length,
// two C arguments for one TS parameter, parameter position only. The C symbols never need to
// exist: decision fixtures run `explain`, never a link.

/** @statorExtern bytes_fill */
declare function extFill(buf: Uint8Array, value: number): number;

/** @statorExtern bytes_sum */
declare function extSum(buf: Uint8Array): number;
