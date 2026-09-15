// Computed keys that are not statically known coerce through ToPropertyKey (plan.md §8 step
// 2a(b)): an object key holds `"[object Object]"`, and null/undefined/boolean/array keys hold
// their string forms -- the dynamic literal stores through `jsrt_dyn_index_set`, which coerces
// the same way through `jsrt_to_string`.

const kObj = {};
const o1 = { [kObj]: 1 };
console.log(Object.keys(o1));
console.log(o1["[object Object]"]);

// A number key with a literal type IS a static key (plan.md §8 step 22): `[kNum]` is the name
// `42` and the literal takes the fixed path, exactly as the direct spelling does.
const kNum = 42;
const o2 = { [kNum]: 2 };
console.log(Object.keys(o2));
console.log(o2["42"]);

const oNull = { [null]: 3 };
console.log(Object.keys(oNull));

const oUndef = { [undefined]: 4 };
console.log(Object.keys(oUndef));

const oBool = { [true]: 5 };
console.log(Object.keys(oBool));

const oArr = { [[1, 2]]: 6 };
console.log(Object.keys(oArr));
