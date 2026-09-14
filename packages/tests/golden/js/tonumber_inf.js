// ToNumber(string) rejects strtod's inf/nan spellings (plan.md §8 step 27 A1,
// docs/NUMERIC.md §6.3: the conversion is NOT strtod). Only "Infinity" with an
// optional sign converts; every case variation and every nan spelling is NaN.
//
// js mode: ts mode's checker rejects string/number coercion before the compiler
// sees it (the to-primitive.js precedent); the runtime is the one ts mode links.
function id(x) {
  return x;
}

console.log(id('inf') - id(0));
console.log(id('INFINITY') - id(0));
console.log(id('Inf') - id(0));
console.log(id('infinity') - id(0));
console.log(id('nan') - id(0));
console.log(id('NaN') - id(0));
console.log(id('Infinity') - id(0));
console.log(id('+Infinity') - id(0));
console.log(id('-Infinity') - id(0));
