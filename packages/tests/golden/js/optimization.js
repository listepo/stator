// The optimization passes in js mode (plan.md §5 Tasks 3.6-3.9).
//
// Nothing here is annotated, so every parameter is `Unknown` and every value stays on the dynamic
// path — and the passes have to be exactly as correct there. Two of them behave differently as a
// result, and that difference is the point of this file sitting beside the typed one.
//
// Const-fold does not care: a literal is a literal in either mode, so the arithmetic folds the same
// way. Inlining mostly stops: `double(21)` has a `number` argument and an `Unknown` parameter, and
// substituting one for the other would replace an unknown-typed subtree with a typed one, which is
// precisely the `Unknown`-preservation rule. The compiler therefore emits the call — and Node,
// which inlines nothing anywhere, prints the same bytes either way. That is the assertion.

// Arithmetic folds bottom-up: the inner operations are literals by the time the outer ones are
// offered, so this whole expression becomes one constant.
console.log(1 + 2 * 3 - 4 / 8);
console.log((1 + 2) * (3 + 4) % 5);

// The three IEEE-754 values a fold must not normalize away. Each is a NUMBER in JavaScript, where
// an integer-flavoured fold would trap or saturate, and each has its own printed form.
console.log(1 / 0);
console.log(-1 / 0);
console.log(0 / 0);
console.log(0 * -1);
console.log(1 / (0 * -1));

// `+` is the operator that is not arithmetic, and the fold has to know it.
console.log("a" + "b" + 1);
console.log(1 + 2 + "c");
console.log("a" < "b");
console.log("10" < "9");

// Bitwise folding runs through ToInt32/ToUint32, and `>>>` is the one whose result leaves int32
// range — so a fold that kept an integer type would print a negative number here.
console.log(-1 >>> 0);
console.log(1 << 31);
console.log(`${255 & 15} ${8 | 1} ${6 ^ 3} ${-16 >> 2}`);

// A template with literal holes folds to one string, which means the compiler's number-to-string
// and the runtime's Ryu have to agree to the last digit.
console.log(`third=${1 / 3}`);
console.log(`${0.1 + 0.2}|${1e21}|${5e-7}`);
console.log(`${typeof 42}${typeof "s"}${typeof true}`);

// A literal `.length` folds; a literal condition picks a branch.
console.log([1, 2, 3].length + "abcd".length);

if (2 > 1) {
  console.log("taken");
} else {
  console.log("not taken");
}

// The eliminated branch keeps its own scope, so this name is free to be reused below.
if (0) {
  const scoped = "dead";
  console.log(scoped);
}
const scoped = "live";
console.log(scoped);

// Short-circuit: the right side is dropped when the left decides, exactly as it is skipped at run
// time. `effect` printing once and only once is what proves the two agree.
function effect() {
  console.log("effect ran");
  return true;
}
console.log(false && effect());
console.log(true || effect());
console.log(true && effect());

// Inlining. `double` is one return over its parameter, so a call with a literal argument becomes
// the body — and then folds to a constant, leaving no call and no function behind.
function double(n) {
  return n * 2;
}
console.log(double(21));
console.log(double(double(3)));

const seven = 7;
console.log(double(seven));

// Not inlinable, and each for a different reason: two statements, and an argument that could have
// a side effect. Both still have to produce the right answer.
function twoStatements(n) {
  const doubled = n + n;
  return doubled;
}
console.log(twoStatements(5));

function sideEffect() {
  console.log("argument evaluated");
  return 4;
}
console.log(double(sideEffect()));

// Nothing calls this, so it is shaken out of the binary. Its absence is not observable — which is
// the point: it is here so that a shake that removed the WRONG function would break the build.
function neverCalled() {
  const unreachable = 99;
  return unreachable;
}

// Recursion is never a candidate, and a real loop still has to run.
function sumTo(n) {
  if (n < 1) {
    return 0;
  }
  return n + sumTo(n - 1);
}
console.log(sumTo(10));

let total = 0;
for (let i = 0; i < 5; i = i + 1) {
  if (1 === 1) {
    total = total + double(i);
  }
}
console.log(total);
