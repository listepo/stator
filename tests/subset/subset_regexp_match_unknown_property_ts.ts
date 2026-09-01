// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: RegExp.prototype methods
// A match array is not an HIR array -- its type is the Unknown a match-or-null has to be -- so the
// Array.prototype surface is not reachable through one. `m.slice` waits for the match array to
// have an HIR type of its own, which is Phase 5's union work, not this representation's.

const m = /(\d+)/.exec('a12');
if (m !== null) {
  console.log(m.slice(1));
}
