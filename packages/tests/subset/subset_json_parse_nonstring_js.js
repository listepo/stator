// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: JSON.parse
// The gate's own answer for a value the checker types as something other than a string: the
// program is leaning on ToString, which the parser does not perform. A build of this file reports
// the lib signature's type error first (STA0012) -- the gate rule is what the subset question
// asks about, and it is the rule that matters once a value reaches the call untyped-but-wrong.
// An UNTYPED argument is accepted instead: js mode has nothing else to offer, and the runtime
// settles the tag loudly.

export const v = JSON.parse(42);
