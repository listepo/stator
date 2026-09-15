// @mode: js
// @verdict: dynamic
// SUBSET.md: Object literals with optional properties, index signatures
// A computed key of a type that is not string/number/symbol is a runtime value: Node applies
// ToPropertyKey coercion (`{ [{}]: 1 }` holds `"[object Object]"`), so the literal builds a
// dynamic object and the key coerces through `jsrt_dyn_index_set` (plan.md §8 step 2a(b)).

const k = {};
const o = { [k]: 1 };
console.log(Object.keys(o));
