/* Index conversions shared by the String and Array builtins (ECMA-262 §7.1.5, §22.1.3.21).
 *
 * Both builtin families receive optional positions as JSRT_UNDEFINED (the lowering pads missing
 * arguments) and both resolve them through the same three spec steps, so the definitions live
 * once, here — an internal header, not part of the codegen↔runtime contract in jsrt_value.h. */
#ifndef JSRT_INDEX_UTIL_H
#define JSRT_INDEX_UTIL_H

#include <math.h>

#include "jsrt_value.h"

/* ToIntegerOrInfinity over an argument that is a number or the padded undefined; `absent` is the
 * spec's default for the undefined case. Truncation toward zero, NaN to +0 — §7.1.5. */
static inline double jsrt_int_or_inf(jsrt_value v, double absent) {
  if (v == JSRT_UNDEFINED) {
    return absent;
  }
  double d = jsrt_number_value(v);
  if (isnan(d)) {
    return 0.0;
  }
  return trunc(d);
}

/* A clamped index: min(max(v, 0), len), after ToIntegerOrInfinity. */
static inline uint32_t jsrt_clamp_index(double v, uint32_t len) {
  if (v <= 0.0) {
    return 0;
  }
  return v >= (double)len ? len : (uint32_t)v;
}

/* A RELATIVE index: negative counts from the end (§22.1.3.21 slice). */
static inline uint32_t jsrt_relative_index(double v, uint32_t len) {
  if (v < 0.0) {
    double adjusted = (double)len + v;
    return adjusted <= 0.0 ? 0 : (uint32_t)adjusted;
  }
  return v >= (double)len ? len : (uint32_t)v;
}

#endif
