// `std/hash` bindings (packages/std/zig/hash.zig). Status returns: 0 success, 1 failure with the
// code in `jsrtStdLastError`; bytes cross as a `Uint8Array`, the view's own storage
// (docs/FFI.md §2), and the backing writes its answer into the view the surface allocated.

/** The digest of `data` into `out` (its exact size): 0 SHA-256, 1 SHA-1, 2 MD5. */
/** @statorExtern jsrt_std_hash_digest */
export declare function jsrtStdHashDigest(kind: number, data: Uint8Array, out: Uint8Array): number;

/** Fills `out`, which must be `size` bytes long, from the OS's secure source. */
/** @statorExtern jsrt_std_hash_random_bytes */
export declare function jsrtStdHashRandomBytes(size: number, out: Uint8Array): number;
