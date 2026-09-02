// @mode: js
// @verdict: static
// SUBSET.md: Function declarations, function expressions, arrow functions

// The per-iteration binding is a language rule, not a typing one; js mode clones the same way.
function each() {
  for (let i = 0; i < 2; i++) {
    const show = function () {
      return i;
    };
    console.log(show());
  }
}
each();
