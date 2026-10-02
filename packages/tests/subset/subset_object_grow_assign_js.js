// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Assignment to a property the object's shape does not declare

// The literal's inferred shape has no `extra`, and a fixed layout cannot grow one: the object
// twin of a class instance's absent member, waiting on Phase 8's dictionary mode.
const o = { a: 1 };
o.extra = 2;
