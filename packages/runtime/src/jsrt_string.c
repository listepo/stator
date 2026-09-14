/* jsrt_string.c — UTF-16 string operations and construction. */

#include "jsrt.h"
#include "jsrt_value.h"

#include <assert.h>
#include <stdlib.h>
#include <string.h>

/* Unwrap helper defined with the operations below; the bounds-checked accessors here share it
 * rather than repeating the assert-and-cast pair. */
static JSString *as_string(jsrt_value v);

/* ============================================================================
 * String accessors — bounds-checked, required by generated C
 * ============================================================================ */

uint32_t jsrt_string_length(jsrt_value v) {
  return as_string(v)->length;
}

uint16_t jsrt_string_char(jsrt_value v, uint32_t i) {
  JSString *str = as_string(v);

  /* Bounds-check the index. Generated C relies on this accessor for safety. */
  if (i >= str->length) {
    return 0; /* Out-of-bounds access returns 0 (or undefined in JS terms). */
  }

  return str->data[i];
}

/* ============================================================================
 * String construction from UTF-8
 * ============================================================================ */

/* Decode a single UTF-8 sequence and return the code point and the number of
 * bytes consumed. Returns -1 on invalid UTF-8. */
static int utf8_decode(const unsigned char *bytes, size_t len, int *out_size) {
  if (len == 0) {
    return -1;
  }

  unsigned char b0 = bytes[0];

  /* Single-byte ASCII: 0xxxxxxx */
  if ((b0 & 0x80) == 0x00) {
    *out_size = 1;
    return (int)b0;
  }

  /* Two-byte: 110xxxxx 10xxxxxx */
  if ((b0 & 0xE0) == 0xC0) {
    if (len < 2) {
      return -1;
    }
    unsigned char b1 = bytes[1];
    if ((b1 & 0xC0) != 0x80) {
      return -1;
    }
    int codepoint = (((int)b0 & 0x1F) << 6) | ((int)b1 & 0x3F);
    if (codepoint < 0x80) {
      return -1; /* Overlong encoding. */
    }
    *out_size = 2;
    return codepoint;
  }

  /* Three-byte: 1110xxxx 10xxxxxx 10xxxxxx */
  if ((b0 & 0xF0) == 0xE0) {
    if (len < 3) {
      return -1;
    }
    unsigned char b1 = bytes[1];
    unsigned char b2 = bytes[2];
    if (((b1 & 0xC0) != 0x80) || ((b2 & 0xC0) != 0x80)) {
      return -1;
    }
    int codepoint =
        (((int)b0 & 0x0F) << 12) | (((int)b1 & 0x3F) << 6) | ((int)b2 & 0x3F);
    if (codepoint < 0x800) {
      return -1; /* Overlong encoding. */
    }
    *out_size = 3;
    return codepoint;
  }

  /* Four-byte: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx */
  if ((b0 & 0xF8) == 0xF0) {
    if (len < 4) {
      return -1;
    }
    unsigned char b1 = bytes[1];
    unsigned char b2 = bytes[2];
    unsigned char b3 = bytes[3];
    if (((b1 & 0xC0) != 0x80) || ((b2 & 0xC0) != 0x80) ||
        ((b3 & 0xC0) != 0x80)) {
      return -1;
    }
    int codepoint = (((int)b0 & 0x07) << 18) | (((int)b1 & 0x3F) << 12) |
                    (((int)b2 & 0x3F) << 6) | ((int)b3 & 0x3F);
    if (codepoint < 0x10000) {
      return -1; /* Overlong encoding. */
    }
    *out_size = 4;
    return codepoint;
  }

  return -1; /* Invalid UTF-8 byte. */
}

/* UTF-16 width of one decoded code point, shared by the two passes below: astral code points
 * encode as a surrogate pair (2 units), everything else as one. */
static uint32_t utf16_units_for(int codepoint) {
  return codepoint <= 0xFFFF ? 1u : 2u;
}

/* Encode one decoded code point as UTF-16, advancing *out past the units written. */
static void utf16_put(uint16_t **out, int codepoint) {
  if (codepoint <= 0xFFFF) {
    /* Single code unit. */
    *(*out)++ = (uint16_t)codepoint;
  } else {
    /* Surrogate pair for codepoints U+10000 and above.
     * High surrogate:  0xD800 + ((cp - 0x10000) >> 10)
     * Low surrogate:   0xDC00 + ((cp - 0x10000) & 0x3FF) */
    int adjusted = codepoint - 0x10000;
    uint16_t high = 0xD800 + (uint16_t)(adjusted >> 10);
    uint16_t low = 0xDC00 + (uint16_t)(adjusted & 0x3FF);
    *(*out)++ = high;
    *(*out)++ = low;
  }
}

/* Decode the UTF-8 sequence at bytes[i] (len - i bytes remain); the code point lands in *cp
 * and *i advances past its width. False at the end of input or at invalid UTF-8, and both
 * passes below stop there: for v0, trailing garbage is treated as empty string (U+FFFD
 * substitution is not implemented yet), so nothing past the first bad byte is counted. */
static bool decode_step(const char *bytes, size_t len, size_t *i, int *cp) {
  int consumed = 0;
  const int codepoint =
      utf8_decode((const unsigned char *)bytes + *i, len - *i, &consumed);
  if (codepoint < 0) {
    return false;
  }
  *cp = codepoint;
  *i += (size_t)consumed;
  return true;
}

jsrt_value jsrt_string_from_utf8(const char *bytes, size_t len) {
  /* First pass: count UTF-16 code units needed. */
  uint32_t utf16_len = 0;
  size_t i = 0;
  int codepoint = 0;

  while (decode_step(bytes, len, &i, &codepoint)) {
    utf16_len += utf16_units_for(codepoint);
  }

  /* Allocate the JSString structure. */
  size_t alloc_size = sizeof(JSString) + (size_t)utf16_len * sizeof(uint16_t);
  JSString *str = (JSString *)jsrt_gc_alloc(alloc_size, "string");

  str->length = utf16_len;

  /* Second pass: decode UTF-8 and encode as UTF-16. */
  uint16_t *out_ptr = str->data;
  i = 0;

  while (decode_step(bytes, len, &i, &codepoint)) {
    utf16_put(&out_ptr, codepoint);
  }

  /* Box the string into a jsrt_value. */
  return JSRT_BOX(JSRT_TAG_STRING, (uintptr_t)str);
}

/* Build a string directly from UTF-16 code units -- the constructor JSON.parse needs, since a
 * parsed JSON string is already a unit sequence (escapes decoded, surrogate pairs left as the
 * two units they are). No validation: lone surrogates are legal JS string contents. */
jsrt_value jsrt_string_from_units(const uint16_t *units, uint32_t len) {
  size_t alloc_size = sizeof(JSString) + (size_t)len * sizeof(uint16_t);
  JSString *str = (JSString *)jsrt_gc_alloc(alloc_size, "string");
  str->length = len;
  if (len > 0) {
    memcpy(str->data, units, (size_t)len * sizeof(uint16_t));
  }
  return JSRT_BOX(JSRT_TAG_STRING, (uintptr_t)str);
}

/* ============================================================================
 * FFI string conversions — docs/FFI.md §3
 * ============================================================================ */

/* TS → C: a NUL-terminated UTF-8 copy in malloc memory the caller owns. Truncates at the
 * first U+0000 (C string semantics); lone surrogates become U+FFFD, because CString is
 * UTF-8 at the boundary and the surrogate range is not UTF-8. Astral pairs combine, so a
 * pair costs four bytes for two units and the len*3+1 sizing still holds. */
char *jsrt_string_to_cstr(jsrt_value v) {
  JSString *str = as_string(v);
  /* Worst case is three bytes per code unit: an astral PAIR takes four bytes for two units. */
  char *out = (char *)malloc((size_t)str->length * 3 + 1);
  if (out == NULL) {
    jsrt_panic("out of memory: CString copy");
  }
  size_t w = 0;
  for (uint32_t r = 0; r < str->length; r++) {
    uint32_t cp = str->data[r];
    if (cp == 0) {
      break;
    }
    if (cp >= 0xD800u && cp <= 0xDBFFu && r + 1 < str->length) {
      const uint32_t low = str->data[r + 1];
      if (low >= 0xDC00u && low <= 0xDFFFu) {
        cp = 0x10000u + ((cp - 0xD800u) << 10) + (low - 0xDC00u);
        r++;
      }
    }
    if (cp >= 0xD800u && cp <= 0xDFFFu) {
      cp = 0xFFFDu; /* lone surrogate */
    }
    if (cp < 0x80u) {
      out[w++] = (char)cp;
    } else if (cp < 0x800u) {
      out[w++] = (char)(0xC0u | (cp >> 6));
      out[w++] = (char)(0x80u | (cp & 0x3Fu));
    } else if (cp < 0x10000u) {
      out[w++] = (char)(0xE0u | (cp >> 12));
      out[w++] = (char)(0x80u | ((cp >> 6) & 0x3Fu));
      out[w++] = (char)(0x80u | (cp & 0x3Fu));
    } else {
      out[w++] = (char)(0xF0u | (cp >> 18));
      out[w++] = (char)(0x80u | ((cp >> 12) & 0x3Fu));
      out[w++] = (char)(0x80u | ((cp >> 6) & 0x3Fu));
      out[w++] = (char)(0x80u | (cp & 0x3Fu));
    }
  }
  out[w] = '\0';
  return out;
}

/* One strict UTF-8 step for the C → TS copy: *cp is the decoded code point, or U+FFFD for
 * one ill-formed maximal subsequence, and *i advances past exactly that subpart. Always
 * succeeds while *i < len.
 *
 * Strict means the WTF-8 `utf8_decode` above accepts is rejected here: the continuation
 * bounds per starter byte throw out overlongs (C0/C1 never start, E0's second byte starts
 * at A0, F0's at 90), surrogates (ED's second byte stops at 9F) and past-U+10FFFF (F4's
 * stops at 8F, F5 and up never start). A byte that ends a partial sequence is reprocessed
 * as a fresh start, and a sequence cut off by the end of input is one subpart — the two
 * rules that make E1 80 E1 80 80 decode to U+FFFD U+4C00, exactly as Node answers. */
static void utf8_strict_step(const unsigned char *bytes, size_t len, size_t *i, int *cp) {
  const unsigned char b0 = bytes[*i];
  if (b0 < 0x80u) {
    *cp = (int)b0;
    *i += 1;
    return;
  }
  unsigned need = 0;
  unsigned lo = 0x80u;
  unsigned hi = 0xBFu;
  if (b0 >= 0xC2u && b0 <= 0xDFu) {
    need = 1;
  } else if (b0 == 0xE0u) {
    need = 2;
    lo = 0xA0u;
  } else if (b0 >= 0xE1u && b0 <= 0xECu) {
    need = 2;
  } else if (b0 == 0xEDu) {
    need = 2;
    hi = 0x9Fu;
  } else if (b0 >= 0xEEu && b0 <= 0xEFu) {
    need = 2;
  } else if (b0 == 0xF0u) {
    need = 3;
    lo = 0x90u;
  } else if (b0 >= 0xF1u && b0 <= 0xF3u) {
    need = 3;
  } else if (b0 == 0xF4u) {
    need = 3;
    hi = 0x8Fu;
  } else {
    /* 0x80-0xC1 and 0xF5-0xFF never start a sequence. */
    *cp = 0xFFFD;
    *i += 1;
    return;
  }
  if (*i + need >= len) {
    /* Cut off by the end of input: the rest is one maximal subpart. */
    *cp = 0xFFFD;
    *i = len;
    return;
  }
  /* Only the FIRST continuation carries the starter's tighter bounds. */
  for (unsigned k = 1; k <= need; k++) {
    const unsigned char bk = bytes[*i + k];
    const unsigned klo = k == 1 ? lo : 0x80u;
    const unsigned khi = k == 1 ? hi : 0xBFu;
    if (bk < klo || bk > khi) {
      /* The subpart is b0 plus the valid continuations before k; bk reprocesses. */
      *cp = 0xFFFD;
      *i += k;
      return;
    }
  }
  int codepoint = 0;
  if (need == 1) {
    codepoint = ((int)(b0 & 0x1Fu) << 6) | (int)(bytes[*i + 1] & 0x3Fu);
  } else if (need == 2) {
    codepoint = ((int)(b0 & 0x0Fu) << 12) | ((int)(bytes[*i + 1] & 0x3Fu) << 6) |
                (int)(bytes[*i + 2] & 0x3Fu);
  } else {
    codepoint = ((int)(b0 & 0x07u) << 18) | ((int)(bytes[*i + 1] & 0x3Fu) << 12) |
                ((int)(bytes[*i + 2] & 0x3Fu) << 6) | (int)(bytes[*i + 3] & 0x3Fu);
  }
  *cp = codepoint;
  *i += need + 1;
}

/* C → TS: copy a NUL-terminated return into a fresh runtime string. The pointer is never
 * wrapped and never freed — its allocator is the library's, not ours, and a malloc-returning
 * C function needs its own extern free function in the same binding (docs/FFI.md §3). */
jsrt_value jsrt_string_from_cstr(const char *s) {
  assert(s != NULL);
  const size_t len = strlen(s);
  const unsigned char *bytes = (const unsigned char *)s;
  /* First pass: count UTF-16 code units needed. */
  uint32_t utf16_len = 0;
  size_t i = 0;
  int codepoint = 0;
  while (i < len) {
    utf8_strict_step(bytes, len, &i, &codepoint);
    utf16_len += utf16_units_for(codepoint);
  }
  size_t alloc_size = sizeof(JSString) + (size_t)utf16_len * sizeof(uint16_t);
  JSString *str = (JSString *)jsrt_gc_alloc(alloc_size, "string");
  str->length = utf16_len;
  /* Second pass: decode again, this time storing. */
  uint16_t *out_ptr = str->data;
  i = 0;
  while (i < len) {
    utf8_strict_step(bytes, len, &i, &codepoint);
    utf16_put(&out_ptr, codepoint);
  }
  return JSRT_BOX(JSRT_TAG_STRING, (uintptr_t)str);
}

/* ============================================================================
 * String operations — equality, comparison, and concatenation
 * ============================================================================ */

/* Unwrap a value the caller has already established is a string. The assert is the contract:
 * these three operations are reached only from the emitter's string paths and from jsrt_ops.c
 * after a tag check, so a non-string here is a compiler bug, not a user error. */
static JSString *as_string(jsrt_value v) {
  assert(jsrt_is(v, JSRT_TAG_STRING));
  return (JSString *)jsrt_ptr(v);
}

jsrt_value jsrt_string_iter_next(jsrt_value s, uint32_t *index) {
  JSString *str = as_string(s);
  uint32_t i = *index;
  if (i >= str->length) {
    return JSRT_UNDEFINED;
  }
  uint32_t take = 1;
  uint16_t c = str->data[i];
  if (c >= 0xD800u && c <= 0xDBFFu && i + 1 < str->length) {
    uint16_t d = str->data[i + 1];
    if (d >= 0xDC00u && d <= 0xDFFFu) {
      take = 2;
    }
  }
  *index = i + take;
  return jsrt_string_from_units(str->data + i, take);
}

bool jsrt_string_equals(jsrt_value a, jsrt_value b) {
  JSString *sa = as_string(a);
  JSString *sb = as_string(b);

  /* Quick check: different lengths means not equal. */
  if (sa->length != sb->length) {
    return false;
  }

  /* Same length: compare code units. */
  for (uint32_t i = 0; i < sa->length; i++) {
    if (sa->data[i] != sb->data[i]) {
      return false;
    }
  }

  return true;
}

int jsrt_string_compare(jsrt_value a, jsrt_value b) {
  JSString *sa = as_string(a);
  JSString *sb = as_string(b);

  uint32_t min_len = sa->length < sb->length ? sa->length : sb->length;

  /* Compare common prefix. */
  for (uint32_t i = 0; i < min_len; i++) {
    if (sa->data[i] < sb->data[i]) {
      return -1;
    }
    if (sa->data[i] > sb->data[i]) {
      return 1;
    }
  }

  /* Prefix is identical; compare by length. */
  if (sa->length < sb->length) {
    return -1;
  }
  if (sa->length > sb->length) {
    return 1;
  }
  return 0;
}

jsrt_value jsrt_string_concat(jsrt_value a, jsrt_value b) {
  JSString *sa = as_string(a);
  JSString *sb = as_string(b);

  /* Check for uint32_t overflow when summing lengths. */
  if (sa->length > UINT32_MAX - sb->length) {
    return JSRT_NULL; /* Allocation would overflow. */
  }

  uint32_t new_len = sa->length + sb->length;

  /* Allocate the combined JSString. */
  size_t alloc_size = sizeof(JSString) + (size_t)new_len * sizeof(uint16_t);
  JSString *result = (JSString *)jsrt_gc_alloc(alloc_size, "string");

  result->length = new_len;

  /* Copy first string. */
  if (sa->length > 0) {
    memcpy(result->data, sa->data, (size_t)sa->length * sizeof(uint16_t));
  }

  /* Copy second string. */
  if (sb->length > 0) {
    memcpy(result->data + sa->length, sb->data, (size_t)sb->length * sizeof(uint16_t));
  }

  /* Box and return. */
  return JSRT_BOX(JSRT_TAG_STRING, (uintptr_t)result);
}
