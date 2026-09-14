/* jsrt_extern.c — conversions at the extern (C-from-TS) call boundary (docs/FFI.md §5).
 *
 * The emitter lowers each extern parameter to one of the three helpers here, so the C spelling
 * a declaration chose is settled once rather than re-spelled per call site. All three are total
 * on the success path and fatal (STA2001, the boundary trap jsrt_check.c owns) off it: a
 * boundary that could be ignored would be a suggestion, and the compiled code past it is
 * allowed to trust the type completely.
 */

#include "jsrt_value.h"

#include "jsrt.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

/* The failure path jsrt_check.c's check_failed owns, restated for inputs that are not plain
 * values: an int32 arrives as a bare double, a pointer as a value that can never mint one.
 * Same code (STA2001), same baked `file:line:col`, same fatal trap -- the emitter's js-mode
 * checks are these same functions, not a second mechanism (docs/FFI.md §9). */
_Noreturn static void extern_check_failed(const char *expected, const char *actual,
                                          const char *where) {
  char message[256];
  (void)snprintf(message, sizeof message, "STA2001: boundary check failed at %s — expected %s, got %s",
                 where, expected, actual);
  jsrt_panic(message);
}

char *jsrt_extern_utf8(jsrt_value v) {
  const uint32_t len = jsrt_string_length(v);
  /* Three bytes per unit is the worst case: a lone surrogate encodes as itself in three
   * bytes (the house rule jsrt_shape_key states), and a pair takes four bytes for two units. */
  char *out = (char *)malloc((size_t)len * 3 + 1);
  if (out == NULL) {
    jsrt_panic("out of memory: extern string");
  }
  size_t n = 0;
  for (uint32_t i = 0; i < len; i++) {
    uint32_t cp = jsrt_string_char(v, i);
    if (cp == 0) {
      break; /* Embedded NUL truncates: a C string cannot hold one (docs/FFI.md §5). */
    }
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < len) {
      const uint32_t trail = jsrt_string_char(v, i + 1);
      if (trail >= 0xDC00 && trail <= 0xDFFF) {
        cp = 0x10000 + ((cp - 0xD800) << 10) + (trail - 0xDC00);
        i++;
      }
    }
    if (cp < 0x80) {
      out[n++] = (char)cp;
    } else if (cp < 0x800) {
      out[n++] = (char)(0xC0 | (cp >> 6));
      out[n++] = (char)(0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
      /* Lone surrogates land here, encoded as themselves -- the house rule. */
      out[n++] = (char)(0xE0 | (cp >> 12));
      out[n++] = (char)(0x80 | ((cp >> 6) & 0x3F));
      out[n++] = (char)(0x80 | (cp & 0x3F));
    } else {
      out[n++] = (char)(0xF0 | (cp >> 18));
      out[n++] = (char)(0x80 | ((cp >> 12) & 0x3F));
      out[n++] = (char)(0x80 | ((cp >> 6) & 0x3F));
      out[n++] = (char)(0x80 | (cp & 0x3F));
    }
  }
  out[n] = '\0';
  return out;
}

int32_t jsrt_extern_int32(double d, const char *loc) {
  /* jsrt_fits_int32 is the whole check: it excludes -0.0 (signbit), NaN and the infinities
   * (the range compares are false for all three), fractions, and out-of-range values --
   * everything the ABI table's "throws rather than truncates" demands (docs/FFI.md §3). */
  if (jsrt_fits_int32(d)) {
    return (int32_t)d;
  }
  extern_check_failed("int32", jsrt_type_name(jsrt_number(d)), loc);
}

void *jsrt_extern_pointer(jsrt_value v, const char *loc) {
  /* A dynamic value can never mint a C address (docs/FFI.md §4): there is no success path,
   * only the trap. `v` feeds the diagnostic -- the brand the declaration named is a
   * compile-time fact this address never sees, so the message names the value's type. */
  extern_check_failed("pointer", jsrt_type_name(v), loc);
}
