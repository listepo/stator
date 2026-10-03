// `std/encoding` bindings (packages/std/zig/encoding.zig). Status returns: 0 success, 1 failure
// with the code in `jsrtStdLastError`; the text is read back through `jsrtStdResult`. Bytes cross
// as a `Uint8Array`, the view's own storage (docs/FFI.md §2).

/** `bytes` as text: 0 UTF-8, 1 Latin-1, 2 base64, 3 base64url, 4 hex. */
/** @statorExtern jsrt_std_encoding_to_text */
export declare function jsrtStdEncodingToText(kind: number, bytes: Uint8Array): number;
