/* jsrt_numeric.c — numeric conversions and comparisons.
 *
 * Implements NUMERIC.md §4 (ToInt32/ToUint32), §5 (NaN/−0/Object.is),
 * §6 (comparison and equality), and the StringNumericLiteral grammar (§6.3).
 *
 * See docs/NUMERIC.md for the complete specification.
 */

#include "jsrt_value.h"

#include <ctype.h>
#include <math.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

/* ============================================================================
 * ToInt32 and ToUint32 — NUMERIC.md §4.1
 * ============================================================================ */

/* ToInt32: convert a double to a signed 32-bit integer using the spec algorithm.
 * This is NOT a C cast (which would be undefined behaviour out of range).
 *
 * Algorithm (NUMERIC.md §4.1):
 *   if x is NaN, +0, -0, +Infinity, or -Infinity  ->  +0
 *   let i = sign(x) * floor(abs(x))          # truncate toward zero
 *   let n = i modulo 2^32                    # mathematical modulo, always non-negative
 *   if n >= 2^31, return n - 2^32
 *   return n */
int32_t jsrt_to_int32(double d) {
  /* NaN and infinities -> 0 */
  if (!isfinite(d)) {
    return 0;
  }

  /* Truncate toward zero: sign(x) * floor(abs(x)) */
  double truncated = d < 0.0 ? -floor(-d) : floor(d);

  /* Mathematical modulo 2^32 (always non-negative).
   * fmod gives a result with the sign of the dividend, so negative truncated
   * values need adjustment. */
  double mod = fmod(truncated, 4294967296.0); /* 2^32 */
  if (mod < 0.0) {
    mod += 4294967296.0;
  }

  /* If >= 2^31, subtract 2^32 to get a negative result */
  if (mod >= 2147483648.0) { /* 2^31 */
    return (int32_t)(mod - 4294967296.0);
  }
  return (int32_t)mod;
}

/* ToUint32: convert a double to an unsigned 32-bit integer.
 * Same algorithm, but return the non-negative modulo directly. */
uint32_t jsrt_to_uint32(double d) {
  if (!isfinite(d)) {
    return 0;
  }

  double truncated = d < 0.0 ? -floor(-d) : floor(d);
  double mod = fmod(truncated, 4294967296.0);
  if (mod < 0.0) {
    mod += 4294967296.0;
  }

  return (uint32_t)mod;
}

/* ============================================================================
 * ToNumber — NUMERIC.md §6.3
 * ============================================================================ */

/* Convert a jsrt_value primitive to a number.
 *
 * - double: return as-is
 * - boolean: true -> 1, false -> 0
 * - null: 0
 * - undefined: NaN
 * - string: StringNumericLiteral grammar
 * - object: ToPrimitive first, then the rules above -- so `Number([5])` is 5, not NaN. */
double jsrt_to_number(jsrt_value v) {
  if (jsrt_is_object(v)) {
    v = jsrt_to_primitive(v);
  }

  if (jsrt_is_double(v)) {
    return jsrt_to_double(v);
  }

  if (jsrt_is(v, JSRT_TAG_BOOL)) {
    return jsrt_as_bool(v) ? 1.0 : 0.0;
  }

  if (jsrt_is(v, JSRT_TAG_NULL)) {
    return 0.0;
  }

  if (jsrt_is(v, JSRT_TAG_UNDEFINED)) {
    return 0.0 / 0.0; /* NaN */
  }

  if (jsrt_is(v, JSRT_TAG_STRING)) {
    return jsrt_string_to_number(v);
  }

  if (jsrt_is(v, JSRT_TAG_INT32)) {
    return (double)jsrt_as_int32(v);
  }

  /* Objects and other types -> NaN (Phase 3 rung 6 when objects land) */
  return 0.0 / 0.0; /* NaN */
}

/* ============================================================================
 * StringNumericLiteral grammar — NUMERIC.md §6.3
 * ============================================================================ */

/* StrWhiteSpaceChar (WhiteSpace + LineTerminator): the trim set for
 * StringNumericLiteral. This is NOT C isspace: the 0x09-0x0D range covers VT
 * (0x0B), which an ASCII-blank set misses, and NBSP/ZWNBSP/the Zs block are
 * trimmable here while interior ones still reject below. */
static bool is_str_white_space(uint16_t ch) {
  if (ch >= 0x0009 && ch <= 0x000D) {
    return true; /* TAB LF VT FF CR */
  }
  if (ch >= 0x2000 && ch <= 0x200A) {
    return true;
  }
  switch (ch) {
    case 0x0020: /* SPACE */
    case 0x00A0: /* NBSP */
    case 0x1680:
    case 0x2028: /* LS */
    case 0x2029: /* PS */
    case 0x202F:
    case 0x205F:
    case 0x3000:
    case 0xFEFF: /* ZWNBSP */
      return true;
    default:
      return false;
  }
}

static bool is_hex_digit(char c) {
  return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

/* Accumulate base-2/8 digits: exact in uint64 while it fits, then double.
 * Hex takes the validated-strtod path below instead, which rounds correctly
 * for huge integers. */
static double parse_small_radix(const char *p, size_t n, unsigned base) {
  uint64_t acc = 0;
  size_t i = 0;
  uint64_t limit = (UINT64_MAX - (uint64_t)(base - 1u)) / (uint64_t)base;
  while (i < n && acc <= limit) {
    acc = acc * (uint64_t)base + (uint64_t)(p[i] - '0');
    i++;
  }
  if (i == n) {
    return (double)acc;
  }
  double d = (double)acc;
  while (i < n) {
    d = d * (double)base + (double)(p[i] - '0');
    i++;
  }
  return d;
}

/* The trimmed ASCII spelling, NUL-terminated with its length. Every branch
 * returns; the caller owns nothing. */
static double parse_numeric_literal(const char *buf, size_t n) {
  const double nan = 0.0 / 0.0;

  /* "Infinity" with an optional sign is the only valid spelling starting with
   * a letter; strtod would also take inf/Inf/INFINITY/nan in any case. */
  if (n == 8 && strncmp(buf, "Infinity", 8) == 0) {
    return INFINITY;
  }
  if (n == 9 && strncmp(buf, "+Infinity", 9) == 0) {
    return INFINITY;
  }
  if (n == 9 && strncmp(buf, "-Infinity", 9) == 0) {
    return -INFINITY;
  }

  /* Unsigned non-decimal forms: no sign allowed, at least one digit, digits
   * only. strtod reads hex itself (including hex floats like 0x1p4, which the
   * grammar rejects), so hex is validated here and only CONVERTED by strtod;
   * binary/octal have no strtod form and accumulate above. */
  if (n >= 2 && buf[0] == '0' &&
      (buf[1] == 'x' || buf[1] == 'X' || buf[1] == 'b' || buf[1] == 'B' ||
       buf[1] == 'o' || buf[1] == 'O')) {
    if (n == 2) {
      return nan; /* "0x", "0b", "0o" with no digits */
    }
    if (buf[1] == 'x' || buf[1] == 'X') {
      for (size_t k = 2; k < n; k++) {
        if (!is_hex_digit(buf[k])) {
          return nan;
        }
      }
      char *endptr = NULL;
      double val = strtod(buf, &endptr);
      if (endptr != buf + n) {
        return nan; /* defensive: validation consumed the whole span */
      }
      return val;
    }
    unsigned base = (buf[1] == 'b' || buf[1] == 'B') ? 2u : 8u;
    for (size_t k = 2; k < n; k++) {
      if (buf[k] < '0' || buf[k] >= (char)('0' + base)) {
        return nan;
      }
    }
    return parse_small_radix(buf + 2, n - 2, base);
  }

  /* A sign does not rescue a non-decimal form ("-0x10" is NaN), and strtod
   * would read signed hex itself; likewise any other inf/nan-case spelling. */
  size_t q = 0;
  if (q < n && (buf[q] == '+' || buf[q] == '-')) {
    q++;
  }
  if (q < n && (buf[q] == 'i' || buf[q] == 'I' || buf[q] == 'n' || buf[q] == 'N')) {
    return nan;
  }
  if (q + 1 < n && buf[q] == '0' &&
      (buf[q + 1] == 'x' || buf[q + 1] == 'X' || buf[q + 1] == 'b' ||
       buf[q + 1] == 'B' || buf[q + 1] == 'o' || buf[q + 1] == 'O')) {
    return nan;
  }

  /* Decimal: strtod, which must consume the entire trimmed span — it accepts
   * no trailing garbage the way the grammar forbids, and consumes nothing for
   * spellings like "" or "e5", both NaN. Embedded NULs end the conversion
   * early and fail the same full-span check. */
  char *endptr = NULL;
  double result = strtod(buf, &endptr);
  if (endptr == buf || endptr != buf + n) {
    return nan;
  }
  return result;
}

/* Parse a string as a number using the spec's StringNumericLiteral grammar,
 * NOT strtod. Key differences:
 *   - strtod accepts trailing garbage; spec does not
 *   - strtod("") returns 0 with no characters consumed; we must check fully
 *   - "0x10" is hex (16); strtod treats it as hex but we must be specific
 *   - "Infinity" parses; strtod may not (depending on implementation)
 *   - StrWhiteSpaceChar trims at both edges; any other non-ASCII unit -> NaN */
double jsrt_string_to_number(jsrt_value s) {
  /* Verify this is a string */
  if (!jsrt_is(s, JSRT_TAG_STRING)) {
    return 0.0 / 0.0; /* NaN */
  }

  uint32_t len = jsrt_string_length(s);

  /* Trim StrWhiteSpaceChar at both ends, then require ASCII in what survives:
   * the grammars below are ASCII-only, so an interior NBSP (or any other
   * non-ASCII unit) is NaN while an edge one was already trimmed. */
  uint32_t pos = 0;
  while (pos < len && is_str_white_space(jsrt_string_char(s, pos))) {
    pos++;
  }
  if (pos >= len) {
    return 0.0; /* empty or all-whitespace */
  }
  uint32_t end = len;
  while (end > pos && is_str_white_space(jsrt_string_char(s, end - 1))) {
    end--;
  }
  for (uint32_t i = pos; i < end; i++) {
    if (jsrt_string_char(s, i) > 127) {
      return 0.0 / 0.0; /* NaN */
    }
  }

  /* Numeric text of any length converts (a 300-digit decimal is 1e300, not
   * NaN), so the spelling is copied to a heap buffer rather than a fixed
   * stack one. The length guard keeps (size_t)len + 1 from wrapping malloc's
   * argument; the NULL check is the OOM answer. */
  if (len == UINT32_MAX) {
    return 0.0 / 0.0; /* NaN */
  }
  size_t n = (size_t)(end - pos);
  char *buf = (char *)malloc(n + 1);
  if (buf == NULL) {
    return 0.0 / 0.0; /* NaN */
  }
  for (uint32_t i = 0; i < (uint32_t)n; i++) {
    buf[i] = (char)jsrt_string_char(s, pos + i);
  }
  buf[n] = '\0';

  double result = parse_numeric_literal(buf, n);
  free(buf);
  return result;
}

/* ============================================================================
 * ToBoolean — NUMERIC.md (derived)
 * ============================================================================ */

/* Truthy/falsy values. False for: false, +0, -0, NaN, undefined, null, empty string.
 * True for everything else (including "0" and "false" as strings). */
bool jsrt_truthy(jsrt_value v) {
  if (jsrt_is(v, JSRT_TAG_BOOL)) {
    return jsrt_as_bool(v);
  }

  if (jsrt_is_double(v)) {
    double d = jsrt_to_double(v);
    /* Falsy: +0, -0, NaN */
    return d != 0.0 && !isnan(d);
  }

  if (jsrt_is(v, JSRT_TAG_INT32)) {
    return jsrt_as_int32(v) != 0;
  }

  if (jsrt_is(v, JSRT_TAG_NULL) || jsrt_is(v, JSRT_TAG_UNDEFINED)) {
    return false;
  }

  if (jsrt_is(v, JSRT_TAG_STRING)) {
    /* Empty string is falsy */
    return jsrt_string_length(v) != 0;
  }

  /* Objects, closures, arrays -> true */
  return true;
}

/* ============================================================================
 * Loose equality (==) — NUMERIC.md §6.3
 * ============================================================================ */

/* Loose equality according to NUMERIC.md §6.3's table.
 *
 * Key insight: null == undefined is true, and null/undefined are equal to
 * nothing else (not even 0). Must short-circuit before any conversion. */
bool jsrt_loose_equals(jsrt_value a, jsrt_value b) {
  /* null == undefined (and undefined == null) */
  if ((jsrt_is(a, JSRT_TAG_NULL) && jsrt_is(b, JSRT_TAG_UNDEFINED)) ||
      (jsrt_is(a, JSRT_TAG_UNDEFINED) && jsrt_is(b, JSRT_TAG_NULL))) {
    return true;
  }

  /* null == null, undefined == undefined */
  if (jsrt_is(a, JSRT_TAG_NULL) && jsrt_is(b, JSRT_TAG_NULL)) {
    return true;
  }
  if (jsrt_is(a, JSRT_TAG_UNDEFINED) && jsrt_is(b, JSRT_TAG_UNDEFINED)) {
    return true;
  }

  /* null and undefined are equal to nothing else */
  if (jsrt_is(a, JSRT_TAG_NULL) || jsrt_is(a, JSRT_TAG_UNDEFINED)) {
    return false;
  }
  if (jsrt_is(b, JSRT_TAG_NULL) || jsrt_is(b, JSRT_TAG_UNDEFINED)) {
    return false;
  }

  /* number OP number -> === */
  if ((jsrt_is_double(a) || jsrt_is(a, JSRT_TAG_INT32)) &&
      (jsrt_is_double(b) || jsrt_is(b, JSRT_TAG_INT32))) {
    return jsrt_strict_equals(a, b);
  }

  /* string OP string -> === */
  if (jsrt_is(a, JSRT_TAG_STRING) && jsrt_is(b, JSRT_TAG_STRING)) {
    return jsrt_strict_equals(a, b);
  }

  /* boolean OP boolean -> === */
  if (jsrt_is(a, JSRT_TAG_BOOL) && jsrt_is(b, JSRT_TAG_BOOL)) {
    return jsrt_strict_equals(a, b);
  }

  /* number OP boolean -> ToNumber(boolean), then === */
  if ((jsrt_is_double(a) || jsrt_is(a, JSRT_TAG_INT32)) && jsrt_is(b, JSRT_TAG_BOOL)) {
    return jsrt_loose_equals(a, jsrt_number(jsrt_to_number(b)));
  }
  if (jsrt_is(a, JSRT_TAG_BOOL) && (jsrt_is_double(b) || jsrt_is(b, JSRT_TAG_INT32))) {
    return jsrt_loose_equals(jsrt_number(jsrt_to_number(a)), b);
  }

  /* string OP boolean -> ToNumber(boolean), then compare */
  if (jsrt_is(a, JSRT_TAG_STRING) && jsrt_is(b, JSRT_TAG_BOOL)) {
    return jsrt_loose_equals(a, jsrt_number(jsrt_to_number(b)));
  }
  if (jsrt_is(a, JSRT_TAG_BOOL) && jsrt_is(b, JSRT_TAG_STRING)) {
    return jsrt_loose_equals(jsrt_number(jsrt_to_number(a)), b);
  }

  /* number OP string -> ToNumber(string), then === */
  if ((jsrt_is_double(a) || jsrt_is(a, JSRT_TAG_INT32)) && jsrt_is(b, JSRT_TAG_STRING)) {
    return jsrt_loose_equals(a, jsrt_number(jsrt_to_number(b)));
  }
  if (jsrt_is(a, JSRT_TAG_STRING) && (jsrt_is_double(b) || jsrt_is(b, JSRT_TAG_INT32))) {
    return jsrt_loose_equals(jsrt_number(jsrt_to_number(a)), b);
  }

  /* object OP object -> reference identity, with NO conversion. Two distinct objects that
   * stringify alike are still unequal, and -- the case whose absence made `a == a` answer false --
   * an object is loosely equal to itself. */
  if (jsrt_is_object(a) && jsrt_is_object(b)) {
    return jsrt_strict_equals(a, b);
  }

  /* object OP primitive -> ToPrimitive the object side and ask again. The recursion terminates
   * because ToPrimitive of an object is a string, which no branch here sends back to an object. */
  if (jsrt_is_object(a)) {
    return jsrt_loose_equals(jsrt_to_primitive(a), b);
  }
  if (jsrt_is_object(b)) {
    return jsrt_loose_equals(a, jsrt_to_primitive(b));
  }

  /* Unreachable: the eight tags are exhausted above. Here so the function has one exit for a
   * ninth, rather than the answer depending on which branch a new tag happens to fall past. */
  return false;
}

/* ============================================================================
 * SameValue (Object.is) — NUMERIC.md §5.2
 * ============================================================================ */

/* Object.is (SameValue): like === but NaN === NaN is true, and -0 !== +0.
 * These are the exact two cases where it differs from ===, and it differs in
 * opposite directions. Do not define this in terms of === with patches. */
bool jsrt_same_value(jsrt_value a, jsrt_value b) {
  /* Differs from === on exactly two inputs, in OPPOSITE directions: NaN matches itself here and
   * does not under ===, while -0 and +0 match under === and do not here. Written independently
   * rather than as "=== with two patches", so neither rule can drift into the other. */
  if (jsrt_is_number(a) && jsrt_is_number(b)) {
    double da = jsrt_number_value(a);
    double db = jsrt_number_value(b);
    if (isnan(da) || isnan(db)) {
      return isnan(da) && isnan(db);
    }
    if (da == 0.0 && db == 0.0) {
      return signbit(da) == signbit(db);
    }
    return da == db;
  }

  /* Everything else: bit equality */
  return a == b;
}

/* ------------------------------------------------------ bitwise operators */

/* uint32 -> int32 without relying on the implementation-defined out-of-range signed conversion.
 * The subtraction is done in uint32 (well-defined, modular), and only a value that already fits
 * int32 is ever cast. */
static int32_t u32_to_i32(uint32_t u) {
  if (u < UINT32_C(0x80000000)) {
    return (int32_t)u;
  }
  return (int32_t)(u - UINT32_C(0x80000000)) - INT32_MAX - 1;
}

/* ToUint32 of the right operand, masked to 5 bits: JavaScript shifts by count % 32, so
 * `1 << 32` is `1`, not 0 (docs/NUMERIC.md §4.3). The mask also makes the C shift legal, since
 * a shift count >= the operand width would be undefined behaviour. */
static uint32_t shift_count(jsrt_value b) {
  return jsrt_to_uint32(jsrt_to_number(b)) & 31u;
}

static uint32_t to_u32(jsrt_value v) { return jsrt_to_uint32(jsrt_to_number(v)); }

jsrt_value jsrt_op_bitand(jsrt_value a, jsrt_value b) {
  return jsrt_number((double)u32_to_i32(to_u32(a) & to_u32(b)));
}

jsrt_value jsrt_op_bitor(jsrt_value a, jsrt_value b) {
  return jsrt_number((double)u32_to_i32(to_u32(a) | to_u32(b)));
}

jsrt_value jsrt_op_bitxor(jsrt_value a, jsrt_value b) {
  return jsrt_number((double)u32_to_i32(to_u32(a) ^ to_u32(b)));
}

jsrt_value jsrt_op_bitnot(jsrt_value a) {
  return jsrt_number((double)u32_to_i32(~to_u32(a)));
}

/* Shifting is done on the UNSIGNED value even for `<<`, whose operand is conceptually signed:
 * `-1 << 1` is a left shift of a negative number, which is undefined behaviour in C but
 * perfectly defined in JavaScript as a bit operation. */
jsrt_value jsrt_op_shl(jsrt_value a, jsrt_value b) {
  return jsrt_number((double)u32_to_i32(to_u32(a) << shift_count(b)));
}

/* Arithmetic (sign-propagating) right shift, done by hand: C's `>>` on a negative signed value
 * is implementation-defined, so the sign bits are OR'd back in explicitly. At a shift of 0 the
 * mask is `~0xFFFFFFFF == 0`, which correctly leaves the value alone. */
jsrt_value jsrt_op_shr(jsrt_value a, jsrt_value b) {
  uint32_t bits = to_u32(a);
  uint32_t count = shift_count(b);
  uint32_t result = bits >> count;
  if ((bits & UINT32_C(0x80000000)) != 0) {
    result |= (uint32_t)~(UINT32_C(0xFFFFFFFF) >> count);
  }
  return jsrt_number((double)u32_to_i32(result));
}

/* The one bitwise operator whose result is NOT an int32: `-1 >>> 0` is 4294967295. */
jsrt_value jsrt_op_ushr(jsrt_value a, jsrt_value b) {
  return jsrt_number((double)(to_u32(a) >> shift_count(b)));
}
