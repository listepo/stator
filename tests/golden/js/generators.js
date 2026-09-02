// The js-mode half of tests/golden/ts/generators.ts. Do not log the generator object.

function* empty() {
  return 5;
}
console.log(empty().next());

function* bare() {
  yield;
}
console.log(bare().next());

function* nums() {
  yield 1;
  yield 2;
  return 99;
}
for (const x of nums()) {
  console.log(x);
}
console.log(nums().next());

function* echo() {
  const a = yield 1;
  const b = yield a;
  return b;
}
const g = echo();
console.log(g.next(999));
console.log(g.next(10));
console.log(g.next(20));

function* acc() {
  let n = 0;
  n = n + 1;
  yield n;
  n = n + 1;
  yield n;
}
for (const x of acc()) {
  console.log(x);
}

function* boom() {
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

function* prefix() {
  console.log("body");
  yield 1;
}
console.log("before");
const p = prefix();
console.log("created");
console.log(p.next());

function* caught() {
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

const expr = function* () {
  yield "from-expr";
};
console.log(expr().next());
