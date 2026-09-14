// @mode: js
// @verdict: dynamic
// SUBSET.md: Optional chaining ?. on a nullishable receiver guards and short-circuits.

function get(o) {
  return o?.x;
}
const v = get(null);
export { v };
