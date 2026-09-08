// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: RegExp.prototype methods
// Same in js mode: the receiver is untyped either way, so the answer does not depend on the mode.
// This is the shape of every name a match does not expose, not a fact about `slice`.

const m = /(\d+)/.exec('a12');
if (m !== null) {
  console.log(m.slice(1));
}
