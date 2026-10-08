// `+=` in a loop extends a shared append buffer; every string built on it stays what it was
// (plan.md §9 Task 6.23, F12).
let s = '';
const snapshots: string[] = [];
for (let i = 0; i < 300; i++) {
  s += String.fromCharCode(97 + (i % 26));
  if (i % 60 === 0) snapshots.push(s);
}
// Two appends onto the same prefix: the second must not see the first's unit.
const bang = s + '!';
const query = s + '?';
console.log(s.length, bang.length, query.length, bang.slice(-3), query.slice(-3));
for (const snap of snapshots) {
  console.log(snap.length, snap.slice(-2));
}

const a = 'x'.repeat(70);
const b = a + a;
const c = b + 'y';
const d = b + 'z';
console.log(c.endsWith('xy'), d.endsWith('xz'), c === d, b + 'y' === c);

let e = b;
e += e;
console.log(e.length, e === b + b);

// A built string is an ordinary string everywhere else.
const counts = new Map<string, number>();
let key = '';
for (let i = 0; i < 100; i++) key += 'k';
counts.set(key, 1);
console.log(counts.get('k'.repeat(100)), /^k+$/.test(key), JSON.stringify(key).length);
let line = '';
for (let i = 0; i < 40; i++) line += i % 10;
console.log(line, `${line}|${line}`.length, line.indexOf('9'), line.split('0').length);

let big = '';
for (let i = 0; i < 200000; i++) big += 'x';
console.log(big.length, big.charCodeAt(199999));
