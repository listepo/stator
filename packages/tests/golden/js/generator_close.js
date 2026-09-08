// gen.return(v) / gen.throw(e): the closing injections (Phase 5 step 8), untyped spelling.
// Do not log the generator object: Node prints Object [Generator] {} and we print Generator {}.

function* never() {
  console.log("body ran");
  yield 1;
  return "end";
}
const nv = never();
console.log(nv.return("closed"));
console.log(nv.next());

const nt = never();
try {
  nt.throw("early");
  console.log("unreachable");
} catch (e) {
  console.log("caught " + e);
}
console.log(nt.next());

function* seq() {
  yield 1;
  yield 2;
  return "tail";
}
const s = seq();
console.log(s.next());
console.log(s.return("stop"));
console.log(s.next());
console.log(s.return("again"));

function* guarded() {
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

function* open() {
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

function* fin() {
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

function* finYield() {
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
