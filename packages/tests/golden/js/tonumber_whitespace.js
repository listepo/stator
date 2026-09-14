// ToNumber(string) trims StrWhiteSpaceChar, not ASCII blanks (plan.md §8 step
// 27 A5, docs/NUMERIC.md §6.3). NBSP and VT trim at both edges; ideographic
// space and ZWNBSP too. Empty and all-whitespace stay 0.
function id(x) {
  return x;
}

console.log(id('\u00a01') - id(0));
console.log(id('1\u00a0') - id(0));
console.log(id('1\u000b') - id(0));
console.log(id('\u000b1') - id(0));
console.log(id('\u30001\u3000') - id(0));
console.log(id('\ufeff1\ufeff') - id(0));
console.log(id(' 1 ') - id(0));
console.log(id('') - id(0));
console.log(id('   ') - id(0));
