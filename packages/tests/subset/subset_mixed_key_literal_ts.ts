// @mode: ts
// @verdict: static
// SUBSET.md: object literals with static keys (integer-like keys take slots)
const o = { a: 1, 10: 2 };
console.log(JSON.stringify(o));
console.log(o.a);
