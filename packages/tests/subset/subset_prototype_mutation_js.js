// @mode: js
// @verdict: not-yet
// @code: STA1204
// @expected-fail: true
// SUBSET.md: Prototype mutation: Object.setPrototypeOf(), __proto__ writes

const obj = {};
Object.setPrototypeOf(obj, null);
export { obj };
