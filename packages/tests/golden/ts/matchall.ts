// String.prototype.matchAll — iterator of match arrays (Phase 5 step 8).
// The iterator object itself prints Object [RegExp String Iterator] {} like Node
// (plan.md §8 step 30 A15, pinned in inspect_matchall_tag.ts); this fixture
// exercises next() results and for-of yields.
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
