// Calling a value of statically-known non-function type (plan.md §8 step 37): js mode
// suppresses the checker's TS2349, so the call lowers to a catchable TypeError with Node's
// message after evaluating the callee and the arguments left to right.
function eff(who) {
  console.log("eval " + who);
  return 5;
}

// The callee evaluates before the throw.
try {
  eff("callee")();
} catch (e) {
  console.log(e.name);
  console.log(e.message);
  console.log(e instanceof TypeError);
}

// Callee, then arguments, then the throw.
try {
  eff("lhs")(eff("arg"));
} catch (e) {
  console.log(e.message);
}

// A call result names its inner callee with (...).
function ret5() {
  return 5;
}
try {
  ret5()();
} catch (e) {
  console.log(e.message);
}

// Literals and keywords are named by their spelling.
try {
  null();
} catch (e) {
  console.log(e.message);
}
try {
  undefined();
} catch (e) {
  console.log(e.message);
}
try {
  ("s")();
} catch (e) {
  console.log(e.message);
}

// In value position the throw still precedes any assignment.
const y = (() => {
  try {
    return eff("v")();
  } catch (e) {
    return "caught:" + e.message;
  }
})();
console.log(y);

// A missing class method throws the same TypeError, naming the property.
class C {
  a = 1;
}
const c = new C();
try {
  c.missing();
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}

// So does a present field that holds a number.
try {
  c.a();
} catch (e) {
  console.log(e.message);
}
console.log("after");
