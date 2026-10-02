// @mode: js
// @verdict: static
// SUBSET.md: Several declarators in one `let`/`const`

let a = 1, b = 'two', c = 3;
const d = a + 1, e = d * 2;
let total = 0;
for (let i = 0, n = e; i < n; i++) {
  total += i;
}
export const out = a + b.length + c + total;
