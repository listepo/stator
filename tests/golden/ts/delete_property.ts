// `delete` in ts mode (plan.md §8 step 2a(c)): the receiver must be a dynamic shape -- a literal
// whose annotation has optional properties -- because those are the objects whose keys live in the
// shape table. A fixed layout is STA1108. The answer is Node's boolean; the next read is
// `undefined`; a re-add lands last in key order; a frozen object throws a TypeError.

const o: { a?: number; b?: number; c?: number } = { a: 1, b: 2, c: 3 };
console.log(delete o.b);
console.log(o.b);
console.log('b' in o);
console.log(Object.keys(o));
console.log(o);
o.b = 20;
console.log(Object.keys(o));
console.log(o);
console.log(delete o.b);
console.log(delete o.b);
const k = 'c';
console.log(delete o[k]);
console.log(o);
console.log(delete o.a);
console.log(o);

const ice: { a?: number } = { a: 1 };
Object.freeze(ice);
try {
  console.log(delete ice.a);
} catch (e) {
  console.log(e instanceof TypeError);
  console.log(e instanceof Error ? e.message : 'other');
}
console.log(ice);
