/** @param {number} value */
function choose(value) {
  return value === undefined ? 7 : value;
}
console.log(choose(1, 2));
console.log(choose());
