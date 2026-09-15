// @mode: js
// @verdict: dynamic
// SUBSET.md: Spread operator ... in array literals
// Spread of a union of arrays: every arm is spreadable, so the empty literal receives and
// the union rides as the spread-or-append concat argument. The operand stays Unknown, so the
// file is dynamic even though the result is an array.

/** @param {number[] | string[]} u */
function first(u) {
  return [...u];
}
export const a = first([1, 2]);
export const b = first(["x"]);
