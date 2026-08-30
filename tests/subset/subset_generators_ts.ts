// @mode: ts
// @verdict: not-yet
// @code: STA1201
// SUBSET.md: generator functions and `yield`

function* counter(): Generator<number> {
  yield 1;
}
export { counter };
