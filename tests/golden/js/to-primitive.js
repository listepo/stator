// ToPrimitive is the conversion every operator runs FIRST when handed an object, and getting its
// PLACE wrong is what this fixture pins -- not whether it exists. `+` asks "is either side a
// string?" AFTER the conversion, so `[1] + [2]` concatenates; ask before, and both sides become
// NaN. `<` asks "are both sides strings?" after it too, so `["10"] < ["9"]` compares text.
//
// These cases live in js mode because ts mode's checker rejects most of them before the compiler
// sees them: `[1] == 1` is "no overlap" and `[1] + 1` is "operator cannot be applied". The
// semantics being checked are the runtime's, and the runtime is the same one ts mode links.

function id(x) {
  return x;
}

const a = [1, 2];
const b = [1, 2];
const one = [1];
const empty = [];

class P {
  constructor(v) {
    this.v = v;
  }
}
const p = new P(1);
const q = new P(1);

// == between two objects is identity, with NO conversion: same contents is not the same object.
// The self-comparison is the case that a missing object branch answers `false` to.
console.log(a == a);
console.log(a == b);
console.log(p == p);
console.log(p == q);
console.log(a != a);
console.log(p != q);

// === never converts either side, so it agrees with == here and disagrees below.
console.log(a === a);
console.log(a === b);

// == between an object and a primitive converts the object and asks again. An array stringifies
// as its elements joined by a comma; a class instance as `[object Object]`.
console.log(a == id('1,2'));
console.log(one == id(1));
console.log(empty == id(''));
console.log(empty == id(0));
console.log(p == id('[object Object]'));

// A boolean operand becomes a number before anything else, so this is `"1" == 1`, not `"1" == "true"`.
console.log(one == id(true));
console.log(empty == id(false));

// null and undefined are equal to each other and to NOTHING else -- the table short-circuits
// before any conversion, so `[] == null` stays false even though `[]` converts to `""` and `""`
// converts to 0.
console.log(empty == id(null));
console.log(empty == id(undefined));

// ToBoolean is a different operation and does not convert: an array is always truthy, including
// the empty one that is loosely equal to false.
if (empty) {
  console.log('an empty array is truthy');
} else {
  console.log('WRONG: ToBoolean converted');
}

// `+`: ToPrimitive both, THEN the string test. Every one of these concatenates.
console.log(one + id(a));
console.log(empty + id(empty));
console.log(one + id(1));
console.log(id(1) + one);
console.log(p + id('!'));

// The other arithmetic operators have no string case at all: they ToNumber the primitive, so an
// array of one number behaves like that number and anything else is NaN.
console.log(id(5) - id(one));
console.log(id(one) * 3);
console.log(-id(one));
console.log(id(a) - 1);
console.log(id(empty) + 1 - 1);

// Bitwise operators run ToInt32 on the primitive, which runs ToNumber, which runs ToPrimitive.
console.log(id(one) | 0);
console.log(id(a) | 0);

// Relational: both-strings is decided AFTER conversion, so these compare text, and "10" < "9".
console.log(id(['10']) < id(['9']));
console.log(id([10]) < id([9]));

// One non-string after conversion sends both through ToNumber, which is why the same left operand
// answers the other way here.
console.log(id(['10']) < id(9));
console.log(empty < one);
console.log(one <= id(1));
console.log(p < q);
console.log(p <= q);

// Template literals and console.log are neither: `${}` is ToString, and console.log inspects.
console.log(`${p}|${a}`);
console.log(p);
console.log(a);
