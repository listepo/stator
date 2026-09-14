// ToNumber(string) rejects signed hex (plan.md §8 step 27 A3). The 0x form is
// unsigned-only, so "-0x10" is NaN where a strtod fall-through answers -16.
// Controls: unsigned hex converts, empty/bad digits and hex floats are NaN.
function id(x) {
  return x;
}

console.log(id('-0x10') - id(0));
console.log(id('+0x10') - id(0));
console.log(id('  -0XABC  ') - id(0));
console.log(id('0x10') - id(0));
console.log(id('0Xff') - id(0));
console.log(id('0x') - id(0));
console.log(id('0xG1') - id(0));
console.log(id('0x1p4') - id(0));
