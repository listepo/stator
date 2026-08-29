// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Function declarations, function expressions, arrow functions

// `i` is a fresh binding each iteration, but a function gets one environment per call, so every
// closure built here would share one slot and read the last iteration's value. Held back until
// loops carry per-iteration environments.
function each(): void {
  for (let i: number = 0; i < 2; i++) {
    const show = function (): number {
      return i;
    };
    console.log(show());
  }
}
each();
