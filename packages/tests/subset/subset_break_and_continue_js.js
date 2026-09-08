// @mode: js
// @verdict: static
// SUBSET.md: break and continue

let result = 0;
for (let i = 0; i < 10; i++) {
  if (i === 3) continue;
  if (i === 7) break;
  result += i;
}
console.log(result);
