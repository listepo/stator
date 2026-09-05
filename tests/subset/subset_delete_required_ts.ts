// @mode: ts
// @verdict: error
// @code: STA1108
// SUBSET.md: delete on a fixed-shape object (a literal whose layout is a struct)

const o = { a: 1 };
delete o.a;
export { o };
