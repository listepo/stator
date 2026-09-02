// String.prototype.matchAll in js mode. Same contract as the ts fixture:
// do not log the iterator object.
const re = /(\d+)/g;
for (const m of 'a1b22c'.matchAll(re)) {
  console.log(m);
}
console.log(re.lastIndex);

const it = 'xy'.matchAll(/x/g);
console.log(it.next());
console.log(it.next());

for (const m of 'aaa'.matchAll(/a*/g)) {
  console.log(m);
}

console.log('z'.matchAll(/a/g).next());

const named = '2026-09'.matchAll(/(?<y>\d{4})-(?<m>\d{2})/g);
console.log(named.next());
