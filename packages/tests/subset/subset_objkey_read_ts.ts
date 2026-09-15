// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Element access
// An object-typed key is the checker's TS2538, and ts mode keeps the refusal: coercion is
// JavaScript's answer, not typed TypeScript's (plan.md §8 step 44b). js mode coerces instead
// (subset_objkey_read_js).

const o = { a: 1 };
const k: object = {};
console.log(o[k]);
