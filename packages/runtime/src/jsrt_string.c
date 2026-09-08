/* jsrt_string.c — UTF-16 string operations and construction. */

#include "jsrt.h"
#include "jsrt_value.h"

#include <assert.h>
#include <stdlib.h>
#include <string.h>

/* ============================================================================
 * String accessors — bounds-checked, required by generated C
 * ============================================================================ */

uint32_t jsrt_string_length(jsrt_value v) {
  /* Verify this is a string. */
  assert(jsrt_is(v, JSRT_TAG_STRING));

  JSString *str = (JSString *)jsrt_ptr(v);
  return str->length;
}

uint16_t jsrt_string_char(jsrt_value v, uint32_t i) {
  /* Verify this is a string. */
  assert(jsrt_is(v, JSRT_TAG_STRING));

  JSString *str = (JSString *)jsrt_ptr(v);

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

jsrt_value jsrt_string_from_utf8(const char *bytes, size_t len) {
  /* First pass: count UTF-16 code units needed. */
  uint32_t utf16_len = 0;
  size_t i = 0;

  while (i < len) {
    int codepoint;
    int consumed;
    codepoint = utf8_decode((const unsigned char *)bytes + i, len - i, &consumed);

    if (codepoint < 0) {
      /* Invalid UTF-8. For v0, treat as empty string or replace with U+FFFD.
       * Here we treat as empty string for simplicity. */
      break;
    }

    if (codepoint <= 0xFFFF) {
      /* Single UTF-16 code unit. */
      utf16_len++;
    } else {
      /* Astral plane: encode as surrogate pair (2 UTF-16 code units). */
      utf16_len += 2;
    }

    i += (size_t)consumed;
  }

  /* Allocate the JSString structure. */
  size_t alloc_size = sizeof(JSString) + (size_t)utf16_len * sizeof(uint16_t);
  JSString *str = (JSString *)jsrt_gc_alloc(alloc_size, "string");

  str->length = utf16_len;

  /* Second pass: decode UTF-8 and encode as UTF-16. */
  uint16_t *out_ptr = str->data;
  i = 0;

  while (i < len) {
    int codepoint;
    int consumed;
    codepoint = utf8_decode((const unsigned char *)bytes + i, len - i, &consumed);

    if (codepoint < 0) {
      break;
    }

    if (codepoint <= 0xFFFF) {
      /* Single code unit. */
      *out_ptr++ = (uint16_t)codepoint;
    } else {
      /* Surrogate pair for codepoints U+10000 and above.
       * High surrogate:  0xD800 + ((cp - 0x10000) >> 10)
       * Low surrogate:   0xDC00 + ((cp - 0x10000) & 0x3FF) */
      int adjusted = codepoint - 0x10000;
      uint16_t high = 0xD800 + (uint16_t)(adjusted >> 10);
      uint16_t low = 0xDC00 + (uint16_t)(adjusted & 0x3FF);
      *out_ptr++ = high;
      *out_ptr++ = low;
    }

    i += (size_t)consumed;
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
