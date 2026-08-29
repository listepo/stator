// Equality and truthiness. The loose table's surprise is that `null` and `undefined` are loosely
// equal to each other and to nothing else — `null == 0` is false even though ToNumber(null) is 0
// (docs/NUMERIC.md §6.3).
const nothing: null = null;
console.log(nothing == undefined);
console.log(nothing != undefined);
console.log(nothing === undefined);

// Through variables, not literals: TypeScript rejects `1 !== 2` outright as a comparison whose
// answer it already knows, so a literal-only test could not be written in ts mode at all.
const one: number = 1;
const two: number = 2;
console.log(one == one);
console.log(one != two);
console.log(one === one);
console.log(one !== two);

// NaN is not equal to itself under any of the three predicates.
const nan: number = 0 / 0;
console.log(nan == nan);
console.log(nan === nan);
console.log(nan != nan);

// +0 and -0 ARE equal under both == and ===; only Object.is separates them.
const zero: number = 0;
console.log(-zero === zero);
console.log(-zero == zero);

// Truthiness in a condition. `if (1)` must take the then-branch: a compiler that tested the
// boxed value's low bit instead of running ToBoolean takes the else-branch here.
if (1) {
  console.log('number 1 is truthy');
} else {
  console.log('WRONG: ToBoolean not applied');
}

if (zero) {
  console.log('WRONG: 0 is falsy');
} else {
  console.log('number 0 is falsy');
}

if (nan) {
  console.log('WRONG: NaN is falsy');
} else {
  console.log('NaN is falsy');
}

// A loop whose condition is a number rather than a comparison.
let countdown: number = 3;
while (countdown) {
  console.log(countdown);
  countdown = countdown - 1;
}

// Objects, in the half of the table ts mode's checker lets through. `==` between two objects is
// identity with NO conversion: contents never enter into it, and an object is loosely equal to
// itself. That last case is the one an implementation missing an object branch answers `false` to,
// which is how `a == a` came to be wrong. The conversion half — an object against a primitive —
// needs the checker out of the way and lives in tests/golden/js/to-primitive.js.
class Point {
  x: number;
  constructor(x: number) {
    this.x = x;
  }
}

const p = new Point(1);
const samePoint = p;
const otherPoint = new Point(1);

console.log(p === samePoint);
console.log(p == samePoint);
console.log(p === otherPoint);
console.log(p == otherPoint);
console.log(p != otherPoint);

const xs: number[] = [1, 2];
const sameXs = xs;
const otherXs: number[] = [1, 2];

console.log(xs === sameXs);
console.log(xs == sameXs);
console.log(xs === otherXs);
console.log(xs == otherXs);
console.log(xs != otherXs);

// An object is truthy whatever it holds, and that is a different operation from `==`: the empty
// array below is truthy AND loosely equal to false (js fixture), which are not in tension.
const emptyXs: number[] = [];
if (emptyXs) {
  console.log('an empty array is truthy');
} else {
  console.log('WRONG: ToBoolean converted');
}
