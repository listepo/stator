// Number.prototype.toString(radix) and toFixed(digits), Number.parseInt/parseFloat and the Number
// constants
// (plan.md §11c T11.4, plan-notes 310), against Node: V8's radix digits (fraction digits to half
// an ulp, zeros past 2^53), toFixed's half-up rounding of the exact value, the special values,
// -0, the 1e21 switch to ToString, an omitted argument, and the RangeErrors.

const x = 255;
console.log(x.toString(), x.toString(16), x.toString(2), (-255).toString(36));
console.log((0.1).toString(3), Math.PI.toString(16), (1e21).toString(7), (2 ** 60 + 3).toString(3));
console.log((-0).toString(2), NaN.toString(16), (-Infinity).toString(5), (0.5).toString(2));
console.log((1.5).toFixed(2), (0.5).toFixed(0), (2.5).toFixed(0), (1.25).toFixed(1), (1.005).toFixed(2));
console.log((-0.0001).toFixed(2), (-0).toFixed(2), (123.456).toFixed(), (1e21).toFixed(2));
console.log((999.995).toFixed(2), (9.5).toFixed(0), (-1.5).toFixed(0), (0.000001).toFixed(7));
console.log((5e-324).toFixed(100));
console.log(x.toString(undefined), x.toFixed(undefined), x.toString(16.9), x.toFixed(1.9));
console.log(Number.parseInt("12px"), Number.parseInt("-ff", 16), Number.parseFloat("3.5e2x"));
console.log(Number.MAX_VALUE, Number.MIN_VALUE, Number.EPSILON, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER);
console.log(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -Number.MAX_VALUE);

const values = [
  0.1, 0.2, 0.3, 1 / 3, 2 / 3, 1e-7, 123456789.125, -98765.4321, 2 ** 53, 2 ** 53 + 2, 1.7976931348623157e308,
  5e-324, 2.2250738585072014e-308, 4.35, 1.45, 8.345, 1234.5678, -0.000123, 1e20 + 1, 9007199254740993,
];
for (const v of values) {
  const radices = [];
  for (let r = 2; r <= 36; r += 1) {
    radices.push(v.toString(r));
  }
  console.log(radices.join(" "));
  const fixed = [];
  for (let d = 0; d <= 20; d += 4) {
    fixed.push(v.toFixed(d));
  }
  console.log(fixed.join(" "));
}

try {
  x.toString(1);
} catch (e) {
  console.log(e instanceof RangeError, e.message);
}
try {
  x.toFixed(101);
} catch (e) {
  console.log(e instanceof RangeError, e.message);
}
