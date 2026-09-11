// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: function declaration inside a block, loop or branch (shadowing case)

function outer() {
  return 'outer';
}
{
  function outer() {
    return 'inner';
  }
  console.log(outer());
}
console.log(outer());
