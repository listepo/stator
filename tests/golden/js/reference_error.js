// Reading a name nothing declares: the answer is a catchable ReferenceError, not a compile error
// (plan.md §8 step 2a(c)). js mode drops TS2304/TS2552 so the runtime can give the real answer.
try {
  console.log(missingName);
} catch (e) {
  console.log(e.name);
  console.log(e.message);
  console.log(e instanceof ReferenceError);
  console.log(e instanceof Error);
  console.log(e instanceof TypeError);
}

// `typeof` is the one position that does NOT throw: the reference is short-circuited before it is
// resolved, which is why this is the idiom for asking whether a global exists at all.
console.log(typeof alsoMissing);
console.log(typeof alsoMissing === 'undefined');

// The throw happens where the read happens, mid-expression, with operands to its left already
// evaluated -- so the catch sees it and the sum never completes.
function side() {
  console.log('left ran');
  return 1;
}
try {
  console.log(side() + stillMissing);
} catch (e) {
  console.log(e.message);
}

// A name declared later in the same scope is NOT this case: it resolves, so it stays a TDZ
// question rather than a ReferenceError read.
const declared = 5;
console.log(declared);
