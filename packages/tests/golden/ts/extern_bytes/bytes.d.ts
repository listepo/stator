// `Uint8Array` parameters through the fixture C beside this file (docs/FFI.md section 2): no
// pragma and no header, so the emitter declares each symbol from the ABI kinds — a view becomes
// `uint8_t *, size_t`, which is exactly how ffi.c spells it.

/** @statorExtern bytes_calls */
declare function bytesCalls(): number;

/** @statorExtern bytes_fill */
declare function bytesFill(buf: Uint8Array, value: number): number;

/** @statorExtern bytes_sum */
declare function bytesSum(buf: Uint8Array): number;

/** @statorExtern bytes_reverse */
declare function bytesReverse(buf: Uint8Array): void;

/** @statorExtern bytes_equal */
declare function bytesEqual(a: Uint8Array, b: Uint8Array): number;
