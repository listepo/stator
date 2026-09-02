// @mode: ts
// @verdict: error
// @code: STA1103
// SUBSET.md: new Function()

const f = new Function("return 42");
export { f };
