// function* / yield: caller-driven resume (Phase 5 step 8).
// Do not log the generator object: Node prints Object [Generator] {} and we print Generator {}.
// Calling gen() only allocates; the body runs on the first next().

function* empty(): Generator<number, number, unknown> {
  return 5;
}
console.log(empty().next());

function* bare(): Generator<undefined> {
  yield;
}
console.log(bare().next());

function* nums(): Generator<number, number, unknown> {
  yield 1;
  yield 2;
  return 99;
}
for (const x of nums()) {
  console.log(x);
}
console.log(nums().next());

function* echo(): Generator<number, number, number> {
  const a: number = yield 1;
  const b: number = yield a;
  return b;
}
const g = echo();
console.log(g.next(999));
console.log(g.next(10));
console.log(g.next(20));

function* acc(): Generator<number> {
  let n: number = 0;
  n = n + 1;
  yield n;
  n = n + 1;
  yield n;
}
for (const x of acc()) {
  console.log(x);
}

function* boom(): Generator<number> {
  yield 1;
  throw "nope";
}
const b = boom();
console.log(b.next());
try {
  b.next();
  console.log("unreachable");
} catch (e) {
  console.log("caught " + e);
}
console.log(b.next());

function* prefix(): Generator<number> {
  console.log("body");
  yield 1;
}
console.log("before");
const p = prefix();
console.log("created");
console.log(p.next());

function* caught(): Generator<string> {
  try {
    yield "one";
    throw "x";
  } catch (e) {
    yield "caught";
  }
}
const c = caught();
console.log(c.next());
console.log(c.next());
console.log(c.next());

const expr = function* (): Generator<string> {
  yield "from-expr";
};
console.log(expr().next());
