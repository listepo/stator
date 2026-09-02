// @mode: js
// @verdict: dynamic
// SUBSET.md: Rest parameters ...args

function sum(a, ...rest) {
  let total = a;
  for (const x of rest) {
    total += x;
  }
  return total;
}
export { sum };
