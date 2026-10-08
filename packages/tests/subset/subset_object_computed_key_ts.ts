// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Computed key on a fixed shape
const levels = { low: 1, high: 3 };
function read(level: string): number {
  return levels[level];
}
console.log(read('low'));
