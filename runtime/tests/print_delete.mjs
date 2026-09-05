// The Node half of print_delete.c — the same objects and deletes, in the same order.
function tryDelete(obj, key) {
  try {
    console.log(delete obj[key]);
  } catch (e) {
    console.log(e.message);
  }
}

const o = { a: 1, b: 2, c: 3 };
tryDelete(o, 'b');
console.log(o.b);
console.log('b' in o);
console.log(Object.keys(o));
console.log(o);
o.b = 20;
console.log(o);
tryDelete(o, 'b');
tryDelete(o, 'b');
tryDelete(o, 'zzz');

const p = { x: 1, y: 2 };
const q = { x: 3, y: 4 };
console.log(q.y);
tryDelete(p, 'x');
console.log(q.y);
console.log(p.y);
console.log(p.x);
console.log(p);
console.log(q);

const solo = { only: 1 };
tryDelete(solo, 'only');
console.log(solo);
solo.again = 2;
console.log(solo);

tryDelete(null, 'x');
tryDelete(undefined, 'x');
const frozen = Object.freeze({ a: 1 });
tryDelete(frozen, 'a');
tryDelete(frozen, 'nope');
console.log(frozen);
const arr = [1];
tryDelete(arr, 'length');
tryDelete(arr, 'nope');
tryDelete('abc', 'length');
tryDelete('abc', '0');
tryDelete('abc', '3');
tryDelete('abc', 'x');
