// `new TypeError('x')` in user code. The descriptor lives in the runtime rather than being emitted
// from a class declaration, which is the only thing distinguishing this from `new C()`
// (plan.md §8 step 2a(c)).
const e = new TypeError('bad input');
console.log(e.name);
console.log(e.message);
console.log(e instanceof TypeError);
console.log(e instanceof Error);
console.log(e instanceof RangeError);

// Every standard class, and the base each reports.
const kinds = [
  new Error('base'),
  new TypeError('t'),
  new RangeError('r'),
  new ReferenceError('f'),
  new SyntaxError('s'),
];
for (const k of kinds) {
  console.log(k.name + '/' + k.message + '/' + (k instanceof Error));
}

// §20.5.1.1 step 3: an omitted message leaves `message` the EMPTY STRING, not undefined.
const bare = new Error();
console.log(bare.message === '');
console.log(bare.name);

// Thrown and caught like any other value, and it keeps its class across the unwind.
function boom() {
  throw new RangeError('out of range');
}
try {
  boom();
} catch (caught) {
  console.log(caught.name + ': ' + caught.message);
  console.log(caught instanceof RangeError);
  console.log(caught instanceof TypeError);
}

// The message is an expression, not only a literal.
const which = 'index';
const built = new ReferenceError(which + ' is not defined');
console.log(built.message);
