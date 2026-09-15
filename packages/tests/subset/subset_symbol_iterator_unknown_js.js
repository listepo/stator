// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: `u[Symbol.iterator]` on an unknown receiver needs runtime GetIterator dispatch
// (plan.md §8 step 2a(c), 2488) — the read and the call share this refusal.

function read(u) {
  return u[Symbol.iterator];
}
function call(u) {
  return u[Symbol.iterator]();
}
export { read, call };
