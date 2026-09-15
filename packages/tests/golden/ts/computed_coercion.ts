// A number key with a literal type is a static key in ts mode too (plan.md §8 step 22):
// `[kNum]` is the name `42`, the literal takes the fixed path, and the checker never refuses
// it. A key of object type stays refused here (STA0012, subset_computed_coercion_ts); only
// js mode coerces it (computed_coercion.js).

const kNum = 42;
const o = { [kNum]: 2 };
console.log(Object.keys(o));
console.log(o["42"]);
