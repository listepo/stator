// The five standard error interfaces are their runtime LAYOUT (plan-notes 223, plan.md §8 step 16).
// Their lib declarations carry an optional `stack`, and the interface itself fell through to
// Unknown, so an INLINE `new Error('x').message` lowered as a dynamic read whose target the
// lowering had concretely typed -- STA4059 on a program Node runs. The interfaces now map to the
// same HType their constructors produce, the way Date and RegExp already did.
const e = new Error('boom');
console.log(e.message);
console.log(e.name);

const t = new TypeError('bad');
console.log(t.message);
console.log(t.name);
console.log(`${t instanceof Error}`);
console.log(`${t instanceof TypeError}`);

console.log(new RangeError('r').message);
console.log(new ReferenceError('ref').message);
console.log(new SyntaxError('syn').message);

const empty = new Error();
console.log(`[${empty.message}]`);

try {
  throw new Error('thrown');
} catch (caught) {
  console.log(caught instanceof Error);
}
