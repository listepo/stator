// plan.md §8 step 2a(b): overload-resolution fallback in js mode.
// JSDoc overloads in a .js file: a call matching no overload runs the implementation
// with the runtime value, exactly as Node does — match calls, the fallback call, and a
// fallback the implementation itself refuses with a catchable Error.

/**
 * @overload
 * @param {number} a
 * @returns {number}
 */
/**
 * @overload
 * @param {string} a
 * @returns {string}
 */
/**
 * @param {unknown} a
 * @returns {unknown}
 */
function f(a) {
  return a;
}

console.log(f(1));
console.log(f("hi"));
console.log(f(true));

/**
 * @overload
 * @param {number} a
 * @returns {number}
 */
/**
 * @overload
 * @param {string} a
 * @returns {string}
 */
/**
 * @param {unknown} a
 * @returns {unknown}
 */
function g(a) {
  if (typeof a !== "number" && typeof a !== "string") throw new Error("bad: " + typeof a);
  return a;
}

console.log(g(7));
try {
  console.log(g(false));
} catch (e) {
  console.log(e.name);
  console.log(e.message);
  console.log(e instanceof Error);
}
