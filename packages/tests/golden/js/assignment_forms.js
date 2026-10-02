// T11.4 family 3 (plan-notes 310): compound and update forms on receivers the compiler only knows
// as Unknown, array length writes, destructuring assignment and several declarators in one `let`.

// Every compound, logical and update form on an untyped receiver; each receiver expression runs
// once however many times the fold names it.
function mark(node, bit) {
  node.flags |= bit;
  node.count += 1;
  node.count++;
  ++node.count;
  node.count -= 1;
  return node.flags;
}
const n = { flags: 1, count: 0, name: null, tag: null };
console.log(mark(n, 4), n.count);
let calls = 0;
function get(o) {
  calls++;
  return o;
}
function bump(o) {
  get(o).count += 10;
  get(o).name ??= 'x';
  get(o).name ||= 'y';
  get(o).flags &&= 2;
  return calls;
}
function show(o) {
  return [o.count, o.name, o.flags].join(' ');
}
console.log(bump(n), show(n));
function expr(o) {
  const a = (o.count += 5);
  const b = o.count++;
  const c = ++o.count;
  const d = (o.tag ??= 't');
  return [a, b, c, d, o.count].join(',');
}
console.log(expr(n));
function str(o) {
  o.text += '!';
  o.text += 1;
  return o.text;
}
console.log(str({ text: 'hi' }));
const parsed = JSON.parse('{"hits": 1, "label": ""}');
parsed.hits *= 7;
parsed.label ||= 'none';
console.log(parsed);

// `length` shrinks an array, typed or not, and rejects a non-uint32.
const xs = [1, 2, 3, 4, 5];
xs.length = 3;
xs.length--;
console.log(xs);
function drop(r) {
  return (r.length = r.length - 1);
}
const ys = ['a', 'b', 'c'];
console.log(drop(ys), ys);
const untyped = JSON.parse('[9, 8, 7]');
untyped.length = 1;
console.log(untyped);
for (const bad of [-1, 1.5]) {
  try {
    xs.length = bad;
  } catch (e) {
    console.log(e.name, e.message);
  }
}

// Destructuring assignment, from a typed and from an untyped right side.
let x = 0;
let label = '';
({ x, y: label } = { x: 3, y: 'a' });
console.log(x, label);
let m, k;
({ m, k } = JSON.parse('{"m": 1, "k": "two"}'));
console.log(m, k);
let a = 0;
let b = 0;
[a, b] = [1, 2];
[a, b] = [b, a];
console.log(a, b);
let c;
[a, , c] = JSON.parse('[10, 20, 30]');
console.log(a, c);

// Several declarators, in a statement and in a `for` header.
let p = 1, q = 'two', r;
console.log(p, q, r);
const fns = [];
for (let i = 0, j = 3; i < j; i++) {
  fns.push(() => i);
}
console.log(fns.map((g) => g()));
