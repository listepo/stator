// Closure display names (plan.md §8 step 17). A declaration's anonymous function carries the
// declarator's source spelling as its display name, so printing one answers the source name
// exactly as Node does — never the step-14 HIR slot name, never anonymous.
const f = () => 1;
console.log(f);
{
  // Shadows the outer `f`: the binding is alpha-renamed, the display name is not.
  const f = () => 2;
  console.log(f);
  console.log(f());
}
console.log(f());

const add = (x) => x + 1;
console.log(add);
function makeAdder(base) {
  // Captures `base` (so the live value is the heap closure) and shadows the module's `add`.
  const add = (x) => x + base;
  console.log(add);
  return add;
}
const add5 = makeAdder(5);
console.log(add5);
console.log(add5(10));

// A named function expression keeps its own name, which is what Node prints for it.
const g = function inner() {
  return 3;
};
console.log(g);
console.log(g());

// `var`-initializer and assignment-position spellings (step-17 follow-up): each names its
// anonymous function exactly as a declaration does.
var vf = () => 7;
console.log(vf);
console.log(vf());

let h;
h = () => 42;
console.log(h);

// A chain resolves to the innermost spelling, which is what Node prints for both.
var xc, yc;
xc = yc = () => 9;
console.log(xc);
console.log(yc);
