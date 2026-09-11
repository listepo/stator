// plan.md §8 step 12(e) in js mode: an untyped callee and untyped block-level declarations.
//
// The ts twins are golden/ts/call_expression.ts and golden/ts/block_function.ts. Here nothing is
// annotated, so every call goes through the dynamic path -- which is the half that would fail
// LOUDLY if a block's declaration were still uninitialised at the call: `jsrt_call_at` on
// `undefined` raises STA2006 rather than answering wrongly.

function inc(n) {
  return n + 1;
}
function dec(n) {
  return n - 1;
}

// The callee is an expression, not a name.
console.log((true ? inc : dec)(10));
console.log((false ? inc : dec)(10));
console.log(
  (function (f) {
    return function (n) {
      return f(f(n));
    };
  })(inc)(0),
);

// Hoisted to the top of its own block, callable above its declaration.
if (inc(0) === 1) {
  console.log(double(3));
  function double(n) {
    return n * 2;
  }
}

// One binding per iteration, captured.
const steps = [];
for (let i = 0; i < 3; i++) {
  function step() {
    return i * 10;
  }
  steps.push(step);
}
console.log(steps.map((f) => f()).join(','));

// Mutual recursion inside one block.
{
  function even(n) {
    return n === 0 ? true : odd(n - 1);
  }
  function odd(n) {
    return n === 0 ? false : even(n - 1);
  }
  console.log(even(10));
  console.log(odd(7));
}
