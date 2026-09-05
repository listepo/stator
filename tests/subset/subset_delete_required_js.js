// @mode: js
// @verdict: not-yet
// @code: STA1205
// SUBSET.md: delete on a fixed-shape object (a literal whose layout is a struct)

const o = { a: 1 };
delete o.a;
export { o };
