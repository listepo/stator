// @mode: ts
// @verdict: static
// SUBSET.md: for loop (C-style)

let result: number = 0;
for (let i: number = 0; i < 10; i++) {
  result += i;
}
console.log(result);
