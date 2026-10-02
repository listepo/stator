// @mode: js
// @verdict: dynamic
// SUBSET.md: Computed key on a fixed shape

// A runtime key reads and writes by name: a declared slot, the overflow table, or `undefined`.
const levels = { low: 1, high: 3 };
function bump(level) {
  levels[level] = (levels[level] || 0) + 1;
}
bump('low');
bump('mid');
console.log(levels);
