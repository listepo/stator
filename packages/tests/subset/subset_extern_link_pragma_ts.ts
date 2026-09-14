// @mode: ts
// @verdict: static
// SUBSET.md: FFI — a binding file carrying @statorLink flags and a header (docs/FFI.md
// section 9). The pragma is link configuration, not code: validated at the declaration's
// span and invisible to the verdict — the calls compile exactly as they would without it.
/// <reference path="./helper_extern_link.d.ts" />

const db = extOpen("app.db" as CString);
console.log(extLinkedVersion(db));
export {};
