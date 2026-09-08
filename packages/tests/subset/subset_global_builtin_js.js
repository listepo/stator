// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Globals: the global object

// Same in js mode: untyped source is never REJECTED, but a global the compiler has no binding for
// is still deferred rather than answered with a compiler bug.
const text = String(1);
console.log(text);
