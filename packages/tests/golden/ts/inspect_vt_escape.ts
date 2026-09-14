// VT is spelled `\x0B` in quoted output (plan.md §8 step 30 A10), not `\v`:
// that spelling is valid JavaScript but not util.inspect's choice. Bare
// top-level strings still print the raw byte — only the quoted form changes.

console.log(['\v']);
console.log(['a\vb']);
console.log({ v: '\v' });
console.log('\v');
console.log(['\b\f\n\r\t']);
