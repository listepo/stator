// Closure display names (plan.md §8 step 17). A declaration's anonymous function carries the
// declarator's source spelling as its display name, so printing one answers the source name
// exactly as Node does — never the step-14 HIR slot name, never anonymous.
const f = (): number => 1;
console.log(f);
{
  // Shadows the outer `f`: the binding is alpha-renamed, the display name is not.
  const f = (): number => 2;
  console.log(f);
  console.log(f());
}
console.log(f());

const add = (x: number): number => x + 1;
console.log(add);
function makeAdder(base: number): (x: number) => number {
  // Captures `base` (so the live value is the heap closure) and shadows the module's `add`.
  const add = (x: number): number => x + base;
  console.log(add);
  return add;
}
const add5 = makeAdder(5);
console.log(add5);
console.log(add5(10));

// A named function expression keeps its own name, which is what Node prints for it.
const g = function inner(): number {
  return 3;
};
console.log(g);
console.log(g());

// Assignment-position spellings (step-17 follow-up): a simple assignment names its anonymous
// function exactly as a declaration does, including a capturing arrow.
let h: () => number;
h = (): number => 42;
console.log(h);
console.log(h());

function makeGetter(base: number): (x: number) => number {
  let f: (x: number) => number;
  // Captures `base`: the live heap closure still prints its spelling.
  f = (x): number => x + base;
  return f;
}
const get7 = makeGetter(7);
console.log(get7);
console.log(get7(10));

// A chain resolves to the innermost spelling, which is what Node prints for both.
let xc: () => number;
let yc: () => number;
xc = yc = (): number => 7;
console.log(xc);
console.log(yc);
