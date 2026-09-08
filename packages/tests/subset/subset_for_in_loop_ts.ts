// @mode: ts
// @verdict: static
// SUBSET.md: for...in loop

const obj: { a: number; b: number } = { a: 1, b: 2 };
for (const key in obj) {
  console.log(key);
}
