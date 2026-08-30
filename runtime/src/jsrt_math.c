/* Math builtins (plan.md §7 Task 4.2) — number -> number, ECMA-262 §21.3.2 exactly.
 *
 * Only the EXACTLY-SPECIFIED operations live here. floor/ceil/trunc/abs/sqrt are IEEE-defined and
 * libm is required to be correct on them; round, sign, min, max and the pow special cases are
 * where ECMA and C89's libm disagree, and each wrapper below exists for a named disagreement.
 * The implementation-approximated transcendentals (sin, log, exp, cbrt, hypot, …) are deliberately
 * ABSENT: golden tests diff against Node byte-for-byte, Node's answers come from V8's fdlibm, and
 * the host libm is allowed to differ in the last ulp — shipping them would make the golden suite
 * hostage to whichever libm built the runtime. They land when fdlibm is vendored, not before.
 *
 * Everything here takes and returns boxed values, canonicalized by jsrt_number like every other
 * producer — arguments are typed `number` by the frontend, and inside checked code annotations
 * are trusted fully (golden rule 4 is about boundaries, and there is none here). */

#include <math.h>
#include <stdbool.h>

#include "jsrt_value.h"

static double arg(jsrt_value v) { return jsrt_number_value(v); }

jsrt_value jsrt_math_abs(jsrt_value x) { return jsrt_number(fabs(arg(x))); }

jsrt_value jsrt_math_ceil(jsrt_value x) { return jsrt_number(ceil(arg(x))); }

jsrt_value jsrt_math_floor(jsrt_value x) { return jsrt_number(floor(arg(x))); }

jsrt_value jsrt_math_sqrt(jsrt_value x) { return jsrt_number(sqrt(arg(x))); }

jsrt_value jsrt_math_trunc(jsrt_value x) { return jsrt_number(trunc(arg(x))); }

/* NOT C round(), twice over: C rounds ties AWAY from zero (round(-2.5) is -3, ECMA says -2 — ties
 * go toward +∞), and the naive floor(x + 0.5) breaks at 0.49999999999999994, where the addition
 * itself rounds up to 1.0. Comparing x - floor(x) against 0.5 never adds, so it never rounds. */
jsrt_value jsrt_math_round(jsrt_value v) {
  double x = arg(v);
  if (!isfinite(x) || x == 0.0) {
    return jsrt_number(x); /* NaN, ±Infinity and ±0 pass through, sign included */
  }
  if (x > 0.0 && x < 0.5) {
    return jsrt_number(0.0);
  }
  if (x < 0.0 && x >= -0.5) {
    return jsrt_number(-0.0); /* §21.3.2.28 step 4: -0.5 ≤ x < 0 answers NEGATIVE zero */
  }
  double f = floor(x);
  return jsrt_number(x - f >= 0.5 ? f + 1.0 : f);
}

jsrt_value jsrt_math_sign(jsrt_value v) {
  double x = arg(v);
  if (isnan(x) || x == 0.0) {
    return jsrt_number(x); /* NaN and ±0 pass through — sign(-0) is -0, not -1 */
  }
  return jsrt_number(x < 0.0 ? -1.0 : 1.0);
}

/* Number::exponentiate, which is NOT C pow() on two points: pow(±1, ±Infinity) is 1 in C and NaN
 * in ECMA, and pow(1, NaN) is 1 in C and NaN in ECMA. Both stem from the same rule — an exponent
 * of NaN or an |base|==1 with infinite exponent has no principled answer, and ECMA says so while
 * C89 guesses. Every other case of C pow matches §6.1.6.1.3, including pow(anything, ±0) == 1. */
jsrt_value jsrt_math_pow(jsrt_value b, jsrt_value e) {
  double base = arg(b);
  double exp = arg(e);
  if (isnan(exp)) {
    return jsrt_number(NAN);
  }
  if ((base == 1.0 || base == -1.0) && isinf(exp)) {
    return jsrt_number(NAN);
  }
  return jsrt_number(pow(base, exp));
}

/* fmin/fmax are close but wrong on both counts that matter: they SKIP a NaN operand (ECMA
 * propagates it), and they answer either zero for min(+0, -0) (ECMA orders -0 below +0). */
static jsrt_value min_max(jsrt_value a, jsrt_value b, bool want_max) {
  double x = arg(a);
  double y = arg(b);
  if (isnan(x) || isnan(y)) {
    return jsrt_number(NAN);
  }
  if (x == 0.0 && y == 0.0) {
    /* min prefers the negative zero, max the positive one. */
    return jsrt_number((signbit(x) != want_max) ? x : y);
  }
  return jsrt_number((want_max ? x > y : x < y) ? x : y);
}

jsrt_value jsrt_math_min(jsrt_value a, jsrt_value b) { return min_max(a, b, false); }

jsrt_value jsrt_math_max(jsrt_value a, jsrt_value b) { return min_max(a, b, true); }

/* The three bit-EXACT members outside the plain-libm set: no approximation anywhere, so no
 * fdlibm question arises (§21.3.2.11, .17, .19). */

/* Count of leading zero bits of ToUint32; 32 for zero. */
jsrt_value jsrt_math_clz32(jsrt_value v) {
  const uint32_t x = jsrt_to_uint32(arg(v));
  if (x == 0) {
    return jsrt_number(32.0);
  }
  uint32_t n = 0;
  for (uint32_t probe = 0x80000000u; (x & probe) == 0; probe >>= 1) {
    n++;
  }
  return jsrt_number((double)n);
}

/* ToInt32 multiply with int32 wrap-around; unsigned arithmetic keeps the overflow defined. */
jsrt_value jsrt_math_imul(jsrt_value a, jsrt_value b) {
  const uint32_t prod = (uint32_t)jsrt_to_int32(arg(a)) * (uint32_t)jsrt_to_int32(arg(b));
  return jsrt_number((double)(int32_t)prod);
}

/* Round-trip through IEEE single precision -- the double nearest to the float nearest to x. */
jsrt_value jsrt_math_fround(jsrt_value v) { return jsrt_number((double)(float)arg(v)); }
