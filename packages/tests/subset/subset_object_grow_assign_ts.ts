// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Assignment to a property the object's shape does not declare

// The checker's TS2339 reports the name too, but the member itself is refused first: a fixed
// layout has no slot for `extra` to name.
const o = { a: 1 };
o.extra = 2;
