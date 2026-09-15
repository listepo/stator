// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- a class alias erases only in place (`new K`, `K.static`,
// `o instanceof K`). Any other use reads the alias as a value, which is the class object
// (plan.md §8 step 12e), and stays not-yet under the same message as the class itself.

class C {
  x: number = 1;
}
const K = C;
console.log(K);
