// Object literals with computed keys use the dynamic shape table (docs/VALUE.md §4.10).
// Integer indices sort ahead of string keys in enumeration order.

const key = "prop";
const obj = { b: 1, [0]: 2, [key]: 42 };
console.log(obj);

const only = { [key]: 7 };
console.log(only);
