// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: console
// `%o` is inspect with `{ showHidden: true, depth: 4 }`: an array gains `[length]`, a function
// its own properties, and nesting past depth 2 takes the compact rule the printer does not model.
// Refused rather than printed as `%O` would print it (plan.md §9 Task 6.24).

console.log('%o', [1, 2]);
