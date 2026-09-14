// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: FFI — untagged ambient: `parseInt` is declared in lib.es5.d.ts with no extern
// marker, so the call itself is ordinary and the callee identifier meets the global
// fallthrough (gateIdentifier: every declaration lives in a declaration file), which reports
// STA1214.
console.log(parseInt("42"));
