// @mode: ts
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: for...in loop

const obj: { [key: string]: number } = { a: 1, b: 2 };
let keys: string[] = [];
for (const key in obj) {
  keys.push(key);
}
export { keys };
