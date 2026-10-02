// @mode: js
// @verdict: static
// SUBSET.md: Arrays: an empty literal takes its element type from context (plan-notes 322).
// The JSDoc spelling of the ts fixture: `@type` and `@returns` are the context `[]` reads.

/** @returns {number[]} */
function none() {
  return [];
}

/**
 * @param {readonly string[]} xs
 * @returns {number}
 */
function count(xs) {
  return xs.length;
}

/** @returns {string[]} */
export function collect() {
  /** @type {string[]} */
  const out = [];
  out.push('a');
  const more = /** @type {string[]} */ ([]);
  more.push('b');
  /** @type {boolean[]} */
  let flags;
  flags = [];
  flags.push(out.length === count([]));
  const nums = none();
  nums.push(1);
  return out.concat(more);
}
