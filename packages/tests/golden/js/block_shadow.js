// Block scoping, the SHADOWING half (plan.md §8 step 14). A block-scoped declaration whose name is
// already bound gets a HIR name of its own at the lowering, so the outer binding keeps its slot and
// survives the block. Before that, every one of these printed the INNER value for the outer name --
// HIR names were source names, so the two bindings were one slot and the block's write landed in it.
//
// The four shapes the step's Check names are all here: a `const`, a `let`, a parameter, and a
// function declaration. The same source run on the pinned Node is the ground truth.

const outer = 'outer-const';
{
  const outer = 'inner-const';
  console.log(outer);
}
console.log(outer);

let counter = 1;
{
  let counter = 100;
  counter += 1;
  console.log(counter);
}
console.log(counter);

function param(a) {
  {
    let a = 'shadowed';
    console.log(a);
  }
  return a;
}
console.log(param('argument'));

function named() {
  return 'outer-function';
}
{
  function named() {
    return 'inner-function';
  }
  console.log(named());
}
console.log(named());

// Nesting is not a special case: each level that re-declares gets its own slot, and a reference
// resolves to the NEAREST declaration in scope.
const depth = 0;
{
  const depth = 1;
  {
    const depth = 2;
    {
      const depth = 3;
      console.log(depth);
    }
    console.log(depth);
  }
  console.log(depth);
}
console.log(depth);

// A shadow survives being captured: each closure keeps the binding its own scope resolved to.
const readers = [];
{
  const value = 'block';
  readers.push(function () {
    return value;
  });
}
const value = 'module';
readers.push(function () {
  return value;
});
console.log(readers[0]?.() ?? 'none');
console.log(readers[1]?.() ?? 'none');

// ...and a shadowed binding is per-iteration like any other loop binding.
const counters = [];
for (let i = 0; i < 3; i += 1) {
  const i2 = i * 10;
  counters.push(function () {
    return i2;
  });
}
console.log(counters.map((f) => f()).join(','));

// A shadowing `catch` parameter: the outer binding is untouched after the handler.
const e = 'outer-error';
try {
  throw new Error('thrown');
} catch (e) {
  console.log(e instanceof Error);
}
console.log(e);

// Assignment, not just declaration, writes to the shadowing binding.
let target = 'outer-target';
{
  let target = 'inner-target';
  target = target + '!';
  console.log(target);
}
console.log(target);

// A `for` header that shadows: the loop's binding is the loop's, the outer one is not touched.
let index = 'outer-index';
for (let index = 0; index < 2; index += 1) {
  console.log(`${index}`);
}
console.log(index);
