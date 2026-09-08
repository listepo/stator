// @mode: ts
// @verdict: static
// SUBSET.md: Labeled statements and labeled break/continue

let n: number = 0;
done: {
  n = 1;
  break done;
  n = 2;
}
console.log(n);
