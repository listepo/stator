// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Object literals with static keys
// Duplicate `__proto__` data properties are tsc's grammar check TS1117, and ts mode keeps the
// refusal — the same source js mode also refuses (subset_object_literal_protodup_js), because
// the early SyntaxError (spec B.3.1) is not last-wins JavaScript.

const o = { __proto__: null, other: 1, '__proto__': null };
console.log(o);
