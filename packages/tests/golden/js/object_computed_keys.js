// Object literals with computed keys use the dynamic shape table (docs/VALUE.md §4.10).
// Integer indices sort ahead of string keys in enumeration order.
// The annotation forces the dynamic path: without it the literal-typed `[key]` and the
// numeric `[0]` are static names and the literal takes the fixed path like the direct
// spelling does (plan.md §8 step 22).

const key = "prop";
/** @type {{ [k: string]: number, b?: number }} */
const obj = { b: 1, [0]: 2, [key]: 42 };
console.log(obj);

/** @type {{ [k: string]: number }} */
const only = { [key]: 7 };
console.log(only);
