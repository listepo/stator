// T11.4 family 4 (plan-notes 310): ordinary functions as constructors -- `new F()`, `F.prototype`,
// a function's own properties, `instanceof F`, and the shapes TypeScript's own `_tsc.js` uses.

function P(x) {
  this.x = x;
}
P.prototype.get = function () {
  return this.x;
};
P.count = 0;
P.count += 1;
const p = new P(3);
console.log(p.x, p.get(), p instanceof P, P.count);
console.log(p);
console.log(P);
console.log(P.prototype);
console.log(new P(undefined));
function assert(v) {
  if (!v) throw new Error('no');
}
assert.same = function (a, b) {
  return a === b;
};
console.log(assert.same(1, 1), assert.same(1, 2));
console.log(assert);
let Ctor;
Ctor = P;
const q = new Ctor(5);
console.log(q.x, q.get(), q instanceof P, p.constructor === P, P.prototype.constructor === P);
function R() {
  return { made: true };
}
console.log(new R(), new R() instanceof R);
function N() {}
console.log(new N(), typeof N.prototype, 'get' in p, 'x' in p, 'y' in p);
const arrow = () => 1;
try {
  new arrow();
} catch (e) {
  console.log(e instanceof TypeError, e.message);
}
try {
  console.log({} instanceof arrow);
} catch (e) {
  console.log(e instanceof TypeError, e.message);
}
console.log(p instanceof N, {} instanceof P);
P.prototype = { kind: 'replaced' };
const r = new P(9);
console.log(r, r.kind, r instanceof P, p instanceof P);

function Symbol13(flags, name) {
  this.flags = flags;
  this.escapedName = name;
  this.declarations = void 0;
}
function Type7(checker, flags) {
  this.flags = flags;
  this.checker = checker;
}
var objectAllocator = {
  getSymbolConstructor: () => Symbol13,
  getTypeConstructor: () => Type7,
};
var SymbolConstructor;
function createSymbol(flags, name) {
  SymbolConstructor || (SymbolConstructor = objectAllocator.getSymbolConstructor());
  return new SymbolConstructor(flags, name);
}
const s = createSymbol(4, 'a');
console.log(s, s.flags, s instanceof Symbol13);
const T = objectAllocator.getTypeConstructor();
console.log(new T('ck', 2));
function makeCounter(start) {
  function Counter() {
    this.n = start;
  }
  Counter.prototype.bump = function () {
    this.n += 1;
    return this.n;
  };
  return new Counter();
}
const c = makeCounter(10);
console.log(c.bump(), c.bump(), c);
function Base() {
  this.kind = 'base';
}
Base.prototype.describe = function () {
  return 'I am ' + this.kind;
};
console.log(new Base().describe());
const fns = [Symbol13, Type7];
for (const F of fns) {
  console.log(new F(1, 2));
}
function Leaf() {
  this.own = 1;
}
Leaf.prototype.inherited = 2;
const leaf = new Leaf();
console.log('inherited' in leaf, leaf.inherited, { inner: leaf, list: [new Leaf()] });
