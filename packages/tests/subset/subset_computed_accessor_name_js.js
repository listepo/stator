// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object literals with optional properties, index signatures
// An accessor under a runtime-computed name has no name to install its pair under: the key
// is not known until the program runs (plan.md §8 step 22).

export function build(k) {
  const o = { get [k]() { return 3; } };
  console.log(o);
}
