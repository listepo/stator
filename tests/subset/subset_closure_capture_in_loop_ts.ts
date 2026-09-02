// @mode: ts
// @verdict: static
// SUBSET.md: Function declarations, function expressions, arrow functions

// `i` is a fresh binding each iteration: the loop clones the heap environment so each
// closure sees the value from the iteration that created it.
function each(): void {
  for (let i: number = 0; i < 2; i++) {
    const show = function (): number {
      return i;
    };
    console.log(show());
  }
}
each();
