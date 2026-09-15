// An object-typed key coerces via ToPropertyKey (plan.md §8 step 44b): the read-side twin of
// the suppressed-2464 write coercion. A plain object holds `"[object Object]"`, so a fixed
// shape holding that name hits through the coerced key while every other shape misses to
// `undefined`. Array indices are canonical numeric strings, not ToNumber (`true`, `null` and
// `"01"` all miss where a number coercion would hit).

const o = { a: 1, "[object Object]": 5 };
const k = {};
console.log(o[k]);
console.log(o.a);

const miss = { a: 1 };
console.log(miss[k]);

const arr = ["x", "y"];
console.log(arr[k]);
console.log(arr[true]);
console.log(arr[null]);
console.log(arr["01"]);
console.log(arr["1"]);

const w = { a: 1, "[object Object]": 0 };
w[k] = 2;
console.log(w[k]);
console.log(w.a);
