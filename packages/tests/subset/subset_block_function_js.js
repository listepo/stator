// @mode: js
// @verdict: dynamic
// SUBSET.md: function declaration inside a block, loop or branch

const flag = true;
if (flag) {
  console.log(inner(3));
  function inner(n) {
    return n * 2;
  }
}
