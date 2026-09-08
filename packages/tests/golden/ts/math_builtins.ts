// Math (Task 4.2): the exactly-specified operations, aimed at the cases where ECMA and C libm
// disagree -- round's ties toward +Infinity, sign and min/max on negative zero, NaN propagation,
// and the pow special cases. The approximated transcendentals wait on vendored fdlibm.

console.log(Math.floor(2.7));
console.log(Math.ceil(-2.7));
console.log(Math.trunc(-3.9));
console.log(Math.abs(-5.5));
console.log(Math.sqrt(2));

// Ties round toward +Infinity: 2.5 goes UP to 3, -2.5 goes UP to -2 (C round says -3).
console.log(Math.round(2.5));
console.log(Math.round(-2.5));
// The largest double below 0.5: naive floor(x + 0.5) answers 1, the spec answers 0.
console.log(Math.round(0.49999999999999994));
console.log(Math.round(-0.4) === 0 && 1 / Math.round(-0.4));

console.log(Math.sign(12.5));
console.log(Math.sign(-3));
console.log(1 / Math.sign(-0));

console.log(Math.pow(2, 10));
console.log(Math.pow(2, 0.5));
console.log(Math.pow(1, Infinity));
console.log(Math.pow(NaN, 0));

// Variadic min/max fold left; the zero-argument forms are their identities.
console.log(Math.min(3, 1, 2));
console.log(Math.max(3, 1, 2));
console.log(Math.min());
console.log(Math.max());
console.log(1 / Math.min(0, -0));
console.log(1 / Math.max(-0, 0));
console.log(Math.min(NaN, 1));

console.log(Math.PI);
console.log(Math.E);
console.log(Math.LN2);
console.log(Math.LN10);
console.log(Math.LOG2E);
console.log(Math.LOG10E);
console.log(Math.SQRT2);
console.log(Math.SQRT1_2);

console.log(NaN);
console.log(Infinity);
console.log(-Infinity);

// Composition: a math call is an expression like any other.
const clamped: number = Math.min(Math.max(17, 0), 10);
console.log(clamped);
console.log(Math.floor(2.5) + Math.max(1, 2) * 10);
