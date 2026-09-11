// @mode: ts
// @verdict: static
// SUBSET.md: function declaration inside a block, loop or branch (shadowing case)

function outer(): string {
  return 'outer';
}
{
  function outer(): string {
    return 'inner';
  }
  console.log(outer());
}
console.log(outer());
