// T11.4 family 3 (plan-notes 310): array length writes, destructuring assignment, several
// declarators in one `let`/`const`, and compound forms on a dynamic receiver.

// `length` shrinks the array, in statement and value position, and rejects a non-uint32.
const xs: number[] = [1, 2, 3, 4, 5];
xs.length = 3;
console.log(xs, xs.length);
const ys: string[] = ['a', 'b', 'c'];
function drop(r: string[]): number {
  return (r.length = r.length - 1);
}
console.log(drop(ys), ys);
xs.length -= 1;
xs.length--;
console.log(xs);
let calls = 0;
const get = (): number[] => {
  calls++;
  return xs;
};
get().length = 0;
console.log(xs, calls);
const zs = [1, 2];
zs.length = 2;
for (const bad of [-1, 1.5, NaN]) {
  try {
    zs.length = bad;
  } catch (e) {
    console.log((e as Error).name, (e as Error).message);
  }
}
console.log(zs);

// Destructuring assignment: the right side runs once, then each variable is assigned.
interface P {
  x: number;
  y: string;
}
let x = 0;
let label = '';
const p: P = { x: 3, y: 'a' };
({ x, y: label } = p);
console.log(x, label);
let made = 0;
function make(): P {
  made++;
  return { x: 7, y: 'b' };
}
({ x, y: label } = make());
console.log(x, label, made);
let a = 0;
let b = 0;
[a, b] = [1, 2];
[a, b] = [b, a];
console.log(a, b);
let c = 0;
[a, , c] = [10, 20, 30];
console.log(a, c);
let f = (): number => 0;
({ f } = { f: () => 42 });
console.log(f());

// Several declarators, in a statement and in a `for` header.
let m = 1, n = 'two', o: number | undefined;
const d = m + 1, e = d * 2;
console.log(m, n, o, d, e);
const fns: (() => number)[] = [];
for (let i = 0, k = 3; i < k; i++) {
  fns.push(() => i);
}
console.log(fns.map((g) => g()));

// Compound and update forms on a receiver with an optional property, which is a dynamic shape.
interface Counts {
  hits: number;
  label?: string;
}
const counts: Counts = { hits: 1 };
counts.hits += 2;
counts.hits *= 3;
counts.hits++;
--counts.hits;
console.log(counts.hits, (counts.hits -= 1), counts);
