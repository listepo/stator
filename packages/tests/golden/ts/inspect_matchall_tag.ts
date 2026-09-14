// The matchAll iterator prints its tag (plan.md §8 step 30 A15): Node answers
// `Object [RegExp String Iterator] {}`, not `Iterator {}`. Iteration itself is
// unchanged — next() and for-of still yield the match arrays.

console.log('ab'.matchAll(/a/g));
console.log(['ab'.matchAll(/a/g)]);
console.log({ it: 'ab'.matchAll(/a/g) });
const it = 'ab'.matchAll(/a/g);
console.log(it.next());
for (const m of 'a1b22c'.matchAll(/(\d+)/g)) {
  console.log(m[0]);
}
