// @mode: ts
// @verdict: static
// SUBSET.md: instanceof operator

const xs: number[] = [1];
const o: { x: number } = { x: 1 };
console.log(xs instanceof Array);
console.log(o instanceof Object);
