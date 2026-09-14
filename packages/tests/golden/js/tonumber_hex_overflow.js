// ToNumber(string) does not saturate hex through strtol (plan.md §8 step 27
// A4). "0xffffffffffffffff" is 2^64 - 1 as a double, not LONG_MAX: the digits
// are validated, then converted with full precision.
function id(x) {
  return x;
}

console.log(id('0xabcdef') - id(0));
console.log(id('0xffffffffffffffff') - id(0));
console.log(id('0xFFFFFFFFFFFFFFFF') - id(0));
console.log(id('0x10000000000000000') - id(0));
