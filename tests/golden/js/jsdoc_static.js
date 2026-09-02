/** @param {number} celsius
 * @returns {number}
 */
function toFahrenheit(celsius) {
  return (celsius * 9) / 5 + 32;
}

/** @param {string} name
 * @returns {string}
 */
function greet(name) {
  return "hello " + name;
}

console.log(toFahrenheit(0));
console.log(toFahrenheit(100));
console.log(greet("stator"));
