// The same surface in js mode, plus the dynamic tier: `id(...)` hands back an implicit-any value,
// so its reads, writes and method calls resolve through the shape table (`jsrt_typed_get_prop`,
// `jsrt_dyn_index_get`/`_set`) -- including the canonical-numeric-string keys (`'1'` reads an
// element, `'-0'` and `1.5` read nothing), a method read as a value, and every iterable source
// the constructor drains: a Set, a Map iterator, a generator, an array-like and a primitive.

const u = new Uint8Array([1, 2, 3, 250]);
function id(x) {
  return x;
}
const any = id(u);
console.log('len', any.length, any.byteLength);
console.log('idx', any[0], any[3], any[4], any['1'], any[-0], any['-0'], any[1.5]);
any[1] = 513;
any[9] = 1;
any['2'] = '7';
console.log('after', any);
const m = any.subarray;
const dynb = id(new ArrayBuffer(3));
console.log('dynab', dynb.byteLength, dynb.slice(1), typeof dynb.slice, dynb.foo, any.foo, any.byteOffset, any.buffer.byteLength);
console.log('typeof', typeof m);
console.log('bound', any.subarray(1).length);
const st = new Set();
st.add(4);
st.add(5);
const mp = new Map();
mp.set(1, 2);
console.log('set', new Uint8Array(st), new Uint8Array(mp.keys()), new Uint8Array(id([7, 8])));
function* gen() { yield 1; yield 2; }
console.log('gen', new Uint8Array(gen()));
console.log('arraylike', new Uint8Array({ length: 3, 0: 9, 2: 300 }));
console.log('str', new Uint8Array('3'), new Uint8Array(true), new Uint8Array(null), new Uint8Array(undefined));
console.log('copy', new Uint8Array(u));
const b = new ArrayBuffer(4);
console.log('ab', new Uint8Array(b, 1), new Uint8Array(b, 4), new Uint8Array(b, 1, undefined));
for (const bad of [() => new Uint8Array(b, 5), () => new Uint8Array(b, 1, 4), () => new ArrayBuffer(-1), () => new Uint8Array(1.5), () => u.set([1], 4), () => u.set(null), () => any.subarray(9).length]) {
  try { bad(); console.log('no throw'); } catch (e) { console.log(e.name + ': ' + e.message); }
}
console.log('slice', u.slice(), u.slice(1, -1), u.slice(10), b.slice(-2), b.slice(3, 1));
console.log('neg sub', u.subarray(-3, -1), u.subarray(2, 1));
u.set(u, 0);
u.set(u.subarray(0, 3), 1);
console.log('overlap', u);
u.set('12');
console.log('setstr', u);
u.set(5);
console.log('setnum', u, `${u}`, `${new Uint8Array(0)}` === '');
console.log('json', JSON.stringify({ u, b }), JSON.stringify([new Uint8Array(2)]));
console.log('inst', u instanceof Uint8Array, u instanceof ArrayBuffer, b instanceof ArrayBuffer, u.buffer instanceof ArrayBuffer, typeof u, typeof b);
let s = 0;
for (const x of new Uint8Array([10, 20])) s += x;
console.log('sum', s);
console.log('many', new Uint8Array(300).subarray(0, 7), new Uint8Array([200, 100, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]));
console.log('nested', { x: { y: { z: { w: new Uint8Array(1) } } } }, [[[new ArrayBuffer(1)]]], [[[new ArrayBuffer(0)]]], [[[new Uint8Array(0)]]]);
console.log('ab101', new ArrayBuffer(101));
console.log('ab100', new ArrayBuffer(100).byteLength);
console.log('view', u.buffer.byteLength, u.subarray(1).buffer === u.buffer, u.subarray(2).byteOffset);
