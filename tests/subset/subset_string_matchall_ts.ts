// @mode: ts
// @verdict: dynamic
// SUBSET.md: String.prototype.matchAll
// matchAll answers an iterator of match arrays. A match array is Unknown (index/input/groups
// plus the capture elements), so a file that uses the yield is dynamic.

const re = /(\d+)/g;
for (const m of 'a1b22c'.matchAll(re)) {
  console.log(m);
}
