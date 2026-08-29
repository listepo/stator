// @mode: ts
// @verdict: error
// @code: STA1107
// @expected-fail: true
// SUBSET.md: Prototype mutation: Object.setPrototypeOf(), __proto__ writes

const obj = {};
Object.setPrototypeOf(obj, null);
export { obj };
