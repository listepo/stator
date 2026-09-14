// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — two @statorLink headers in one binding file (docs/FFI.md section 9). One
// file wraps one library: the second header is refused at its own line, and the first still
// stands — the rule is about the count, not the spelling.
/// <reference path="./helper_extern_link_twoheaders.d.ts" />

console.log(extF());
export {};
