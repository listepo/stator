// @mode: js
// @verdict: static
// SUBSET.md: Promise.prototype.finally
// A then/catch handler is an untyped callback in js, so those spellings report dynamic;
// the goldens prove then/catch/new Promise. A zero-arg finally callback infers.

Promise.resolve(1).finally(() => undefined);
