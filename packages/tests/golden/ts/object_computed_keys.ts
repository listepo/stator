// Object literals with computed keys use the dynamic shape table (docs/VALUE.md §4.10).
// Integer indices sort ahead of string keys in enumeration order.

const key: string = "prop";
const obj: { [k: string]: number; b?: number } = { b: 1, [0]: 2, [key]: 42 };
console.log(obj);

const only: { [k: string]: number } = { [key]: 7 };
console.log(only);
