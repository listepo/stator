// Two checks that ts mode keeps and js mode must not: `noFallthroughCasesInSwitch` and
// `useUnknownInCatchVariables`. Both refuse VALID JavaScript rather than untyped JavaScript, so in
// js mode they violate §1.2's contract outright. Test262's own harness found them -- it falls
// through on purpose in `formatIdentityFreeValue` and reads `err.name` off a catch binding -- and
// until they were split by mode, every harnessed conformance test failed on the runner's own
// configuration rather than on anything about the compiler (plan-notes 175).
//
// The point of a GOLDEN here rather than only a decision test: "js mode compiles it" is worth
// nothing if it compiles to the wrong answer. Fallthrough semantics (the second clause runs, the
// third does not) and the value read off the binding both have to match Node byte-for-byte.

function classify(x) {
  let out = "";
  switch (x) {
    case 1:
      out = "one";
    case 2:
      out = `${out}|two`;
      break;
    case 3:
      out = "three";
    default:
      out = `${out}|rest`;
  }
  return out;
}

console.log(classify(1));
console.log(classify(2));
console.log(classify(3));
console.log(classify(9));

function thrownLength(value) {
  try {
    throw value;
  } catch (e) {
    return e.length;
  }
}

console.log(thrownLength("boom"));
console.log(thrownLength(""));

function rethrown(value) {
  try {
    try {
      throw value;
    } catch (inner) {
      throw `${inner}!`;
    }
  } catch (outer) {
    return outer;
  }
}

console.log(rethrown("x"));
