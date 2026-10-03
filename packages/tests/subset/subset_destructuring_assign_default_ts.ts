// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Destructuring assignment

// A default, a rest, a nested pattern, a member target, or the assignment's value being used:
// each is refused until the destructuring family lands.
let a = 0;
({ a = 5 } = {});
