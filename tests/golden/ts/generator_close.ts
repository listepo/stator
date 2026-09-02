// gen.return(v) / gen.throw(e): the closing injections (Phase 5 step 8).
// Do not log the generator object: Node prints Object [Generator] {} and we print Generator {}.

// return on an UNSTARTED generator closes it without running the body.
function* never(): Generator<number, string, undefined> {
  console.log("body ran");
  yield 1;
  return "end";
}
const nv = never();
console.log(nv.return("closed"));
console.log(nv.next());

// throw on an unstarted generator rethrows to the caller; the body never runs.
const nt = never();
try {
  nt.throw("early");
  console.log("unreachable");
} catch (e) {
  console.log("caught " + e);
}
console.log(nt.next());

// return mid-iteration skips the remaining yields and the body's own return value.
function* seq(): Generator<number, string, undefined> {
  yield 1;
  yield 2;
  return "tail";
}
const s = seq();
console.log(s.next());
console.log(s.return("stop"));
console.log(s.next());
// a completed generator's return answers the NEW value (ECMA-262 27.5.1.3)
console.log(s.return("again"));

// throw mid-iteration is caught by the body's own try, exactly as if the yield threw.
function* guarded(): Generator<string, string, undefined> {
  try {
    yield "a";
    yield "b";
  } catch (e) {
    yield "caught";
  }
  yield "after";
  return "fin";
}
const g = guarded();
console.log(g.next());
console.log(g.throw("x"));
console.log(g.next());
console.log(g.next());

// a throw the body does not catch propagates to .throw's caller and completes the generator.
function* open(): Generator<number, void, undefined> {
  yield 1;
  yield 2;
}
const o = open();
console.log(o.next());
try {
  o.throw("boom");
  console.log("unreachable");
} catch (e) {
  console.log("caught " + e);
}
console.log(o.next());

// return runs the finally blocks between the parked yield and the top.
function* fin(): Generator<string, string, undefined> {
  try {
    yield "one";
    yield "two";
  } finally {
    console.log("fin");
  }
  return "done";
}
const f = fin();
console.log(f.next());
console.log(f.return("ret"));
console.log(f.next());

// a finally that yields DELAYS the return: the answer is the finally's yield, and the parked
// completion value arrives on the next next().
function* finYield(): Generator<string, string, undefined> {
  try {
    yield "one";
  } finally {
    yield "from-finally";
    console.log("fin2");
  }
  return "done";
}
const fy = finYield();
console.log(fy.next());
console.log(fy.return("ret"));
console.log(fy.next());
console.log(fy.next());
