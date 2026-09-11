// A block is a SCOPE, and a `for` header binds in the loop's own (plan-notes 213).
//
// Both halves here used to be wrong in different ways, which is why they share a fixture. A
// block-scoped name read after its block resolved inside the lowering (whose binding map was one
// flat map for the whole function) and nowhere inside the verifier, so `typeof x` was an internal
// error instead of Node's `"undefined"`. A `for` header binding leaked the same way but further:
// it stayed RESOLVABLE, so `typeof i` after the loop answered `"number"` from the loop's own stale
// slot -- a wrong answer, which is worse than a refusal because nothing reports it.
//
// Node is the ground truth for every line: an ES module is strict, so these bindings are the
// block-scoped ones the spec defines and Annex B's function-scoped alias does not exist.

{
  let x = 1;
  const y = 2;
  function f() {
    return x + y;
  }
  class Local {
    m() {
      return x;
    }
  }
  console.log(f());
  console.log(new Local().m());
}

// Out of the block, all three names are gone -- `typeof` is the read that asks without throwing.
console.log(typeof x);
console.log(typeof y);
console.log(typeof f);
console.log(typeof Local);

// A read that is not `typeof` throws, and the throw is catchable like any other.
try {
  console.log(x);
} catch (e) {
  console.log(`${e.name}: ${e.message}`);
}

// The `for` header's binding belongs to the loop, and each iteration re-binds it.
for (let i = 0; i < 2; i += 1) {
  const doubled = i * 2;
  console.log(`${i}:${doubled}`);
}
console.log(typeof i);
console.log(typeof doubled);

// `var` is the exception that proves the rule: it hoists to the function, so it survives its block.
{
  var leaked = 'here';
}
console.log(leaked);
console.log(typeof leaked);

// A block inside a function behaves the same way: its bindings do not survive it, and the
// function's own binding is not the block's to touch.
function outer() {
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

// A switch's clause list is ONE scope: a declaration made under one clause is out of scope after
// the whole statement, not merely after its clause.
switch (1) {
  case 1: {
    let only = 'case';
    console.log(only);
    break;
  }
  default:
    break;
}
console.log(typeof only);

// try/finally blocks are scopes too.
try {
  let inTry = 'try';
  console.log(inTry);
} finally {
  console.log('finally ran');
}
console.log(typeof inTry);
