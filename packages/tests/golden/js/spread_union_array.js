// Spread of a union of arrays: every arm is spreadable, so the union spreads even
// though the element type is only known at run time. Both members and every position
// (first, middle, last) keep iteration order. The union arrives via JSDoc and via a
// ternary the checker infers.
/** @param {number[] | string[]} u */
function first(u) {
  return [...u];
}
console.log(first([1, 2]));
console.log(first(["a", "b"]));

/** @param {number[] | string[]} u */
function middle(u) {
  return [0, ...u, 9];
}
console.log(middle([1, 2]));
console.log(middle(["a", "b"]));

/** @param {number[] | string[]} u */
function last(u) {
  return [0, ...u];
}
console.log(last([1, 2]));
console.log(last(["a", "b"]));

/** @param {number[] | string[]} u
 *  @param {number[] | string[]} v */
function two(u, v) {
  return [...u, ...v];
}
console.log(two([1], ["a"]));
console.log(two(["a"], [1]));

const flag = true;
const inferred = flag ? [1, 2] : ["a", "b"];
console.log([...inferred]);
