// Math's approximated transcendentals (Task 4.2), through the vendored fdlibm.
//
// This fixture is the reason `runtime/vendor/fdlibm/` exists. Every line here PASSED before the
// vendoring for the boring inputs and FAILED for the interesting ones, because the host libm and
// V8 disagree in the last ulp on most arguments (plan-notes 117: up to 41% of random inputs for
// tan). The values below are deliberately not round numbers -- a fixture of Math.sin(0) would
// have agreed with Node all along and proved nothing.

// Exponential and logarithmic.
console.log(Math.exp(1));
console.log(Math.exp(-7.25));
console.log(Math.expm1(1e-9));
console.log(Math.log(3));
console.log(Math.log(0.1));
console.log(Math.log10(1234.5678));
console.log(Math.log1p(1e-12));
console.log(Math.log2(0.7));
console.log(Math.cbrt(1234.5678));
console.log(Math.cbrt(-27));

// Trigonometric. Large arguments exercise the argument reduction, which is where a libm is most
// likely to diverge -- fdlibm reduces modulo an extended-precision pi, and not every libm does.
console.log(Math.sin(0.7));
console.log(Math.cos(0.7));
console.log(Math.tan(0.7));
console.log(Math.sin(1e10));
console.log(Math.cos(1e10));
console.log(Math.tan(123.456));

// Inverse trigonometric.
console.log(Math.asin(0.3));
console.log(Math.acos(0.3));
console.log(Math.atan(0.3));
console.log(Math.atan2(1, 3));
console.log(Math.atan2(-1, -3));

// Hyperbolic and inverse hyperbolic.
console.log(Math.sinh(1.5));
console.log(Math.cosh(1.5));
console.log(Math.tanh(1.5));
console.log(Math.asinh(1.5));
console.log(Math.acosh(1.5));
console.log(Math.atanh(0.5));

// Domain edges: outside the domain is NaN, not a trap.
console.log(Math.log(-1));
console.log(Math.sqrt(-1));
console.log(Math.asin(2));
console.log(Math.acosh(0.5));
console.log(Math.atanh(1));
console.log(Math.log(0));

// Signed zero survives the ones that preserve it (Object.is-level detail, printed via 1/x).
console.log(1 / Math.sin(-0));
console.log(1 / Math.atan(-0));
console.log(1 / Math.cbrt(-0));

// hypot: BINARY only. The scaling matters -- an unscaled a*a + b*b overflows to Infinity here,
// while the true result is finite and well within range.
console.log(Math.hypot(3, 4));
console.log(Math.hypot(1e200, 1e200));
console.log(Math.hypot(5e-200, 5e-200));
console.log(Math.hypot(Infinity, NaN));
console.log(Math.hypot(NaN, 2));
console.log(Math.hypot(0, 0));
console.log(Math.hypot(-3, -4));
// The degenerate arities the lowering answers directly: hypot() is +0, hypot(x) is |x|.
console.log(Math.hypot());
console.log(Math.hypot(-7.5));
