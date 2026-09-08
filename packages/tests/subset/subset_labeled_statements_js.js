// @mode: js
// @verdict: static
// SUBSET.md: Labeled statements and labeled break/continue

let result = 0;
outer: for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    if (j === 1) break outer;
    result += i + j;
  }
}
console.log(result);
