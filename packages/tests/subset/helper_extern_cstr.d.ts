// Helper for the subset_extern_cstr_* decision fixtures (docs/FFI.md sections 1-3): the
// extern declarations whose call sites the fixtures pin as not-yet(STA1217, Phase 7).
// Pulled into each entry's program with a `/// <reference path />`; the gate skips
// declaration files, so these declarations never meet it — only the call sites do, until
// steps 5+ land the lowering.

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern */
declare function cStrLen(s: CString): number;

/** @statorExtern c_echo */
declare function cEcho(s: CString): CString;
