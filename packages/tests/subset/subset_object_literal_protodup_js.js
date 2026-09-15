// @mode: js
// @verdict: error
// @code: STA0012
// SUBSET.md: Object literals with static keys
// Duplicate `__proto__` data properties are an early SyntaxError (spec B.3.1) — Node answers
// "Duplicate __proto__ fields are not allowed in object literals" — so js mode refuses them
// even though ordinary duplicate keys are last-wins (subset_object_literal_duplicate_keys_js).
// A computed key, a shorthand, a method, or a spread beside a data `__proto__` stays dynamic.

const o = { __proto__: null, other: 1, '__proto__': null };
console.log(o);
