// @mode: js
// @verdict: static
// SUBSET.md: FFI — a binding file carrying @statorLink flags and a header (docs/FFI.md
// section 9), used from untyped code. The pragma is about the FILE, not the caller, so the
// verdict matches the ts twin: validated once, invisible to every call.
/// <reference path="./helper_extern_link.d.ts" />

const db = extOpen("app.db");
console.log(extLinkedVersion(db));
