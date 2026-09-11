// The ts-mode twin of `js/block_scope.js` (plan-notes 213). TS mode refuses a read of a name that
// is not in scope (TS2304), so the out-of-scope half of the js fixture is not expressible here --
// what this file pins is the half that is: a block's declarations stay inside it, `var` is the one
// binding that does not, and a `for` header binds in the loop's own scope.

{
  let x = 1;
  const y = 2;
  function f(): number {
    return x + y;
  }
  class Local {
    m(): number {
      return x;
    }
  }
  console.log(f());
  console.log(new Local().m());
}

// Two sibling blocks may each declare a name of their own, with different types. One slot shared
// by name is what the lowering's flat map produced before; the blocks are separate scopes, so the
// second declaration is not a re-declaration of the first.
{
  let value = 1;
  console.log(value);
}
{
  let value = 'two';
  console.log(value);
}

// `var` is permanently refused in this mode (STA1104), so the binding that survives its block has
// no ts-mode spelling -- the js fixture is where that half lives.

// The `for` header's binding belongs to the loop, and each iteration re-binds it.
for (let i = 0; i < 2; i += 1) {
  const doubled = i * 2;
  console.log(`${i}:${doubled}`);
}

// A block inside a function: its bindings do not survive it.
function outer(): number {
  let total = 0;
  {
    let inner = 100;
    inner += 1;
    console.log(inner);
  }
  console.log(total);
  return total;
}
console.log(outer());

// A switch's clause list is ONE scope, and a block inside a clause is a scope of its own.
switch (1) {
  case 1: {
    const only = 'case';
    console.log(only);
    break;
  }
  default:
    break;
}
