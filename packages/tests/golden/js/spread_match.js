// [...m] over a narrowed match array spreads element-wise (plan.md §8 step 44a): the
// checker calls it an interface, so the HType model calls it Unknown, but at run time it IS a
// dense array and the spread folds into `[].concat(m)` — the shape every non-first spread
// already took. First, middle and last positions, plus `String.prototype.match`.

const m = /a(b)/.exec("ab");
if (m !== null) {
  console.log(JSON.stringify([...m]));
  console.log(JSON.stringify([0, ...m]));
  console.log(JSON.stringify([...m, 1]));
} else {
  console.log("no-match");
}

const m2 = "ab".match(/a(b)/);
if (m2 !== null) {
  console.log(JSON.stringify([...m2]));
} else {
  console.log("no-match");
}

// A union of a match array and an array is always an array at run time, so it folds into
// `[].concat(u)` like an all-array union.
const m3 = /a(b)/.exec("ab") ?? [];
console.log(JSON.stringify([...m3]));
