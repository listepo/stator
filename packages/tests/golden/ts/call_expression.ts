// plan.md §8 step 12(e): the callee of a call is an ordinary expression.
// `CallExpr.callee` was always a general Expression and the emitter always evaluated it into its
// own rooted slot; only the gate insisted on an identifier or a function literal.

function inc(n: number): number {
  return n + 1;
}
function dec(n: number): number {
  return n - 1;
}

// A conditional callee, both ways.
console.log((true ? inc : dec)(10));
console.log((false ? inc : dec)(10));

// An element of an array of functions, narrowed past noUncheckedIndexedAccess.
const fns: ((n: number) => number)[] = [inc, dec];
const first = fns[0];
if (first !== undefined) {
  console.log(first(10));
}

// A call whose result is called. Evaluation order is callee-then-arguments, and `pick` must run
// before `arg` does -- the two counters prove it rather than asserting it.
const order: string[] = [];
function pick(which: boolean): (n: number) => number {
  order.push('pick');
  return which ? inc : dec;
}
function arg(): number {
  order.push('arg');
  return 10;
}
console.log(pick(false)(arg()));
console.log(order.join(','));

// An IIFE, which was already accepted, kept here so the family reads as one.
console.log(
  ((n: number): number => {
    return n * 2;
  })(21),
);

// A function READ out of a shape and then called. The read is the value position; the call is of
// a local, so this is not the `o.m()` receiver question that keeps "calling a class field" not-yet.
const holder: { run: (n: number) => number } = { run: inc };
const run = holder.run;
console.log(run(41));

// Nesting: the callee of the callee.
function twice(f: (n: number) => number): (n: number) => number {
  return (n: number): number => f(f(n));
}
console.log(twice(inc)(0));
console.log(twice(twice(inc))(0));
