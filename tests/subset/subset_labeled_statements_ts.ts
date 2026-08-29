// @mode: ts
// @verdict: static
// SUBSET.md: Labeled statements and labeled break/continue

let result: number = 0;
outer: for (let i: number = 0; i < 3; i++) {
  for (let j: number = 0; j < 3; j++) {
    if (j === 1) break outer;
    result += i + j;
  }
}
console.log(result);
