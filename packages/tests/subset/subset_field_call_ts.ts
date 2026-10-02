// @mode: ts
// @verdict: static
// SUBSET.md: Calls of an object's function-valued field

// A factory returning an object literal whose fields hold closures -- an arrow, a function
// expression and a shorthand function declaration -- called as `o.f()`.
function makeCounter(start: number) {
  let n = start;
  function bump(by: number): number {
    n += by;
    return n;
  }
  return { bump, read: (): number => n, reset: function (): void { n = start; } };
}
const counter = makeCounter(1);
counter.bump(2);
counter.reset();
export const value: number = counter.read();
