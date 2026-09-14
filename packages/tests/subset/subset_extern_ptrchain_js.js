// @mode: js
// @verdict: not-yet
// @code: STA1217
// @expected-fail: true
// SUBSET.md: FFI — branded-pointer chain from untyped code (docs/FFI.md section 2 `T*` row):
// open returns the handle, query and close each consume it. Only the producer lives in a
// `.d.ts` today (helper_extern_ffi.d.ts); query/close dangle until step 6 provides them, and a
// dangling name is js-mode runtime business (program.ts JS_MODE_RUNTIME_CODES swallows 2304).
// The reported code is error STA1114 instead: the declaration walk reports EVERY bad signature
// in the shared helper and the first never wins (explain.ts classify), which is cTakeAny — the
// same reason subset_extern_call_js carries expected-fail. The pin names the STA1217 step 6
// must produce once the triple has a helper of its own.
/// <reference path="./helper_extern_ffi.d.ts" />

const h = extOpenDb("app.db");
console.log(extQuery(h));
extClose(h);
