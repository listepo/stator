// Writing to a name nothing declares. §1.2 makes every module strict in both modes, so PutValue on
// an unresolvable reference throws a ReferenceError rather than creating a global (plan.md §8 step
// 2a(c)). The two forms differ in WHEN they throw, and this fixture is what pins the difference.

// A simple `=` evaluates its right side FIRST and throws after, so `rhs ran` is printed.
function rhs() {
  console.log('rhs ran');
  return 1;
}
try {
  missingTarget = rhs();
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}

// A compound assignment reads the target before the right side runs, so it throws immediately and
// `never ran` is NOT printed.
function never() {
  console.log('never ran');
  return 1;
}
try {
  missingCompound += never();
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}

// An update is a read too, so it throws on the read.
try {
  missingUpdate++;
} catch (e) {
  console.log(e.message);
}
try {
  --missingPrefix;
} catch (e) {
  console.log(e.message);
}

// A write is still catchable as an Error, and the class chain is the real one.
try {
  missingClass = 1;
} catch (e) {
  console.log(e instanceof ReferenceError);
  console.log(e instanceof Error);
}
