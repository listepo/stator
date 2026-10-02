// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Calls of an object's function-valued field

// A field whose inferred type is not a function: Node throws a TypeError at the call. The
// field-call path loads only a function-typed (or Unknown) field, so this stays refused.
const o = { n: 5 };
o.n();
