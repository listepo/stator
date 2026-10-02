// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Number methods

// Every `Number` static but `parseInt` and `parseFloat` is refused by name.
export const whole: boolean = Number.isInteger(3);
