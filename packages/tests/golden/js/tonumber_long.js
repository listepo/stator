// ToNumber(string) has no length cap (plan.md §8 step 27 A6). A 301-code-unit
// decimal is 1e300, a 303-unit fraction is 1e-301, and long whitespace is 0 —
// none of them is NaN.
function id(x) {
  return x;
}

console.log(id('1' + '0'.repeat(300)) - id(0));
console.log(id('0.' + '0'.repeat(300) + '1') - id(0));
console.log(id(' '.repeat(500)) - id(0));
