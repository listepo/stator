// ToNumber(string) reads the 0b/0o integer forms (plan.md §8 step 27 A2).
// Unsigned only, at least one digit, digits only — a sign or a bad digit is
// NaN, exactly like the 0x form.
function id(x) {
  return x;
}

console.log(id('0b101') - id(0));
console.log(id('0B101') - id(0));
console.log(id('0o17') - id(0));
console.log(id('0O17') - id(0));
console.log(id('0b1') - id(0));
console.log(id('0o7') - id(0));
console.log(id('0b') - id(0));
console.log(id('0o') - id(0));
console.log(id('0b102') - id(0));
console.log(id('0o88') - id(0));
console.log(id('-0b101') - id(0));
console.log(id('+0o17') - id(0));
