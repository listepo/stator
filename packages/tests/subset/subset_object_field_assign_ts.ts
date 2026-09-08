// @mode: ts
// @verdict: static
// SUBSET.md: Object field assignment

const o: { x: number } = { x: 1 };
o.x = 2;
o.x += 3;
console.log(o.x);
