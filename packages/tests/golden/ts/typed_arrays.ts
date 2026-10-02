// `Uint8Array` + `ArrayBuffer` on statically typed receivers (plan.md §11c T11.1): every
// constructor form, ToUint8 at the element store, `subarray` (a VIEW, so writes show through) vs
// `slice` (a copy), an overlapping `set`, the RangeError messages V8 writes, and Node's inspect
// forms -- the empty view, the numeric grouping past six entries, the 100-entry cap, the
// `[Uint8Contents]` hex dump and its 100-byte cap, and the depth abbreviation.

const u = new Uint8Array(4);
u[0] = 1;
u[1] = 300;
u[2] = -1;
u[3] = 1.9;
console.log(u, u.length, u.byteLength, u.byteOffset);
const v = u[1];
console.log(v, u[9]);
const b = new ArrayBuffer(8);
const w = new Uint8Array(b, 2, 4);
w[0] = 0xab;
console.log(b, w, w.buffer === b, b.byteLength);
const s = u.subarray(1, 3);
s[0] = 7;
console.log(u, s, s.byteOffset);
const c = u.slice(-2);
c[0] = 99;
console.log(u, c);
u.set([5, 6], 2);
console.log(u);
u.set(u.subarray(0, 2), 1);
console.log(u);
let total = 0;
for (const x of u) {
  total += x;
}
console.log(total);
console.log(new Uint8Array([1, 2, 3, 4, 5, 6, 7]), '' + u, JSON.stringify(u), JSON.stringify(b));
console.log(new Uint8Array(u.subarray(2)), b.slice(1, 3), u instanceof Uint8Array, b instanceof ArrayBuffer);
try {
  new Uint8Array(-1);
} catch (e) {
  console.log('' + e);
}
try {
  new Uint8Array(b, 9);
} catch (e) {
  console.log('' + e);
}
try {
  u.set([1, 2, 3, 4, 5]);
} catch (e) {
  console.log('' + e);
}
console.log([new Uint8Array(0), new Uint8Array(2)], { a: new ArrayBuffer(2) }, [[[[new Uint8Array(1), new ArrayBuffer(0)]]]]);
console.log(new Uint8Array(120));
console.log(new ArrayBuffer(102));
