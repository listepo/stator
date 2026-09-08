// @mode: js
// @verdict: dynamic
// SUBSET.md: String.prototype.matchAll

const re = /(\d+)/g;
for (const m of 'a1b22c'.matchAll(re)) {
  console.log(m);
}
