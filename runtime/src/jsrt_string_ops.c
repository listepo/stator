/* String.prototype builtins (plan.md §7 Task 4.2) — UTF-16 code-unit semantics, ECMA-262 §22.1.3.
 *
 * Everything here is EXACT: searches and slices are code-unit operations with no locale, no
 * normalization and no approximation, so byte-for-byte agreement with Node is a property of the
 * algorithm, not of the machine. The two places the spec reaches beyond what a fixed table can
 * answer are handled loudly instead of wrongly (golden rule 4): case mapping outside ASCII waits
 * on vendored libunicode (Task 4.3 brings it with libregexp), and `repeat` with a negative count
 * must throw a catchable RangeError, which the builtin call protocol cannot raise yet — both
 * panic with a runtime not-yet, never a wrong answer.
 *
 * Optional arguments arrive as JSRT_UNDEFINED — the LOWERING pads missing ones, and for every
 * method here the spec gives an explicitly-passed `undefined` the same meaning as an absent
 * argument, which is what makes the padding sound. */

#include <math.h>
#include <stdlib.h>
#include <string.h>

#include "jsrt.h"
#include "jsrt_index_util.h"
#include "jsrt_value.h"

static JSString *str_of(jsrt_value v) { return (JSString *)jsrt_ptr(v); }

static JSString *alloc_str(uint32_t len) {
  size_t size = sizeof(JSString) + (size_t)len * sizeof(uint16_t);
  JSString *s = (JSString *)jsrt_gc_alloc(size, "string");
  s->length = len;
  return s;
}

static jsrt_value box_str(JSString *s) { return JSRT_BOX(JSRT_TAG_STRING, (uintptr_t)s); }

static jsrt_value substr(const JSString *s, uint32_t from, uint32_t to) {
  uint32_t len = to > from ? to - from : 0;
  JSString *out = alloc_str(len);
  if (len > 0) {
    memcpy(out->data, s->data + from, (size_t)len * sizeof(uint16_t));
  }
  return box_str(out);
}

static bool match_at(const JSString *hay, const JSString *needle, uint32_t at) {
  return needle->length == 0 ||
         memcmp(hay->data + at, needle->data, (size_t)needle->length * sizeof(uint16_t)) == 0;
}

/* StringIndexOf (§6.1.4.1): smallest k >= start with a match, or -1. An empty needle matches at
 * start itself (start <= len guaranteed by callers). */
static int64_t index_of_from(const JSString *hay, const JSString *needle, uint32_t start) {
  if (needle->length > hay->length) {
    return -1;
  }
  for (uint32_t k = start; k + needle->length <= hay->length; k++) {
    if (match_at(hay, needle, k)) {
      return (int64_t)k;
    }
  }
  return -1;
}

jsrt_value jsrt_string_char_at(jsrt_value s, jsrt_value i) {
  const JSString *str = str_of(s);
  double pos = jsrt_int_or_inf(i, 0.0);
  if (pos < 0.0 || pos >= (double)str->length) {
    return box_str(alloc_str(0));
  }
  return substr(str, (uint32_t)pos, (uint32_t)pos + 1);
}

/* `at` is charAt with a RELATIVE index and an honest out-of-range answer: undefined, where
 * charAt answers the empty string (§22.1.3.1 vs §22.1.3.2). */
jsrt_value jsrt_string_at(jsrt_value s, jsrt_value i) {
  const JSString *str = str_of(s);
  double pos = jsrt_int_or_inf(i, 0.0);
  if (pos < 0.0) {
    pos += (double)str->length;
  }
  if (pos < 0.0 || pos >= (double)str->length) {
    return JSRT_UNDEFINED;
  }
  return substr(str, (uint32_t)pos, (uint32_t)pos + 1);
}

/* Unlike charCodeAt this answers undefined out of range (not NaN), and combines a valid
 * surrogate pair into its code point (§22.1.3.4). */
jsrt_value jsrt_string_code_point_at(jsrt_value s, jsrt_value i) {
  const JSString *str = str_of(s);
  double pos = jsrt_int_or_inf(i, 0.0);
  if (pos < 0.0 || pos >= (double)str->length) {
    return JSRT_UNDEFINED;
  }
  const uint32_t p = (uint32_t)pos;
  const uint16_t lead = str->data[p];
  if (lead >= 0xd800 && lead <= 0xdbff && p + 1 < str->length) {
    const uint16_t trail = str->data[p + 1];
    if (trail >= 0xdc00 && trail <= 0xdfff) {
      return jsrt_number((double)(0x10000 + ((lead - 0xd800) << 10) + (trail - 0xdc00)));
    }
  }
  return jsrt_number((double)lead);
}

/* Identity on a primitive receiver, both of them -- the object-wrapper cases the spec unwraps
 * cannot arise, because there are no String objects in this runtime. */
jsrt_value jsrt_string_to_string(jsrt_value s) { return s; }

jsrt_value jsrt_string_value_of(jsrt_value s) { return s; }

jsrt_value jsrt_string_char_code_at(jsrt_value s, jsrt_value i) {
  const JSString *str = str_of(s);
  double pos = jsrt_int_or_inf(i, 0.0);
  if (pos < 0.0 || pos >= (double)str->length) {
    return jsrt_number(NAN);
  }
  return jsrt_number((double)str->data[(uint32_t)pos]);
}

jsrt_value jsrt_string_index_of(jsrt_value s, jsrt_value search, jsrt_value from) {
  const JSString *hay = str_of(s);
  uint32_t start = jsrt_clamp_index(jsrt_int_or_inf(from, 0.0), hay->length);
  return jsrt_number((double)index_of_from(hay, str_of(search), start));
}

jsrt_value jsrt_string_last_index_of(jsrt_value s, jsrt_value search, jsrt_value from) {
  const JSString *hay = str_of(s);
  const JSString *needle = str_of(search);
  /* §22.1.3.10: the default and a NaN position are both +Infinity, NOT zero -- which is why this
   * does not go through int_or_inf's NaN-to-zero rule. */
  double pos = from == JSRT_UNDEFINED ? INFINITY : jsrt_number_value(from);
  double num = isnan(pos) ? INFINITY : trunc(pos);
  uint32_t start = jsrt_clamp_index(num, hay->length);
  if (needle->length > hay->length) {
    return jsrt_number(-1.0);
  }
  uint32_t last = hay->length - needle->length;
  if (start < last) {
    last = start;
  }
  for (uint32_t k = last;; k--) {
    if (match_at(hay, needle, k)) {
      return jsrt_number((double)k);
    }
    if (k == 0) {
      break;
    }
  }
  return jsrt_number(-1.0);
}

jsrt_value jsrt_string_includes(jsrt_value s, jsrt_value search, jsrt_value from) {
  const JSString *hay = str_of(s);
  uint32_t start = jsrt_clamp_index(jsrt_int_or_inf(from, 0.0), hay->length);
  return jsrt_bool(index_of_from(hay, str_of(search), start) >= 0);
}

jsrt_value jsrt_string_starts_with(jsrt_value s, jsrt_value search, jsrt_value from) {
  const JSString *hay = str_of(s);
  const JSString *needle = str_of(search);
  uint32_t start = jsrt_clamp_index(jsrt_int_or_inf(from, 0.0), hay->length);
  return jsrt_bool(start + needle->length <= hay->length && match_at(hay, needle, start));
}

jsrt_value jsrt_string_ends_with(jsrt_value s, jsrt_value search, jsrt_value end) {
  const JSString *hay = str_of(s);
  const JSString *needle = str_of(search);
  uint32_t stop = jsrt_clamp_index(jsrt_int_or_inf(end, (double)hay->length), hay->length);
  return jsrt_bool(stop >= needle->length && match_at(hay, needle, stop - needle->length));
}

jsrt_value jsrt_string_slice(jsrt_value s, jsrt_value a, jsrt_value b) {
  const JSString *str = str_of(s);
  uint32_t from = jsrt_relative_index(jsrt_int_or_inf(a, 0.0), str->length);
  uint32_t to = jsrt_relative_index(jsrt_int_or_inf(b, (double)str->length), str->length);
  return substr(str, from, to);
}

jsrt_value jsrt_string_substring(jsrt_value s, jsrt_value a, jsrt_value b) {
  const JSString *str = str_of(s);
  uint32_t from = jsrt_clamp_index(jsrt_int_or_inf(a, 0.0), str->length);
  uint32_t to = jsrt_clamp_index(jsrt_int_or_inf(b, (double)str->length), str->length);
  /* substring SWAPS a backwards pair where slice answers empty -- the one behavioural
   * difference between the two. */
  if (from > to) {
    uint32_t t = from;
    from = to;
    to = t;
  }
  return substr(str, from, to);
}

/* The spec's TrimString whitespace: WhiteSpace (§12.2) plus LineTerminator (§12.3). The Unicode
 * Space_Separator category is FIXED by the standard's own list, so this table is exact, not an
 * approximation. */
static bool is_trim_space(uint16_t c) {
  switch (c) {
    case 0x0009: /* TAB */
    case 0x000A: /* LF */
    case 0x000B: /* VT */
    case 0x000C: /* FF */
    case 0x000D: /* CR */
    case 0x0020: /* SPACE */
    case 0x00A0: /* NBSP */
    case 0x1680: /* OGHAM SPACE MARK */
    case 0x2028: /* LINE SEPARATOR */
    case 0x2029: /* PARAGRAPH SEPARATOR */
    case 0x202F: /* NARROW NO-BREAK SPACE */
    case 0x205F: /* MEDIUM MATHEMATICAL SPACE */
    case 0x3000: /* IDEOGRAPHIC SPACE */
    case 0xFEFF: /* ZWNBSP */
      return true;
    default:
      return c >= 0x2000 && c <= 0x200A; /* EN QUAD .. HAIR SPACE */
  }
}

static jsrt_value trim_impl(jsrt_value s, bool from_start, bool from_end) {
  const JSString *str = str_of(s);
  uint32_t from = 0;
  uint32_t to = str->length;
  if (from_start) {
    while (from < to && is_trim_space(str->data[from])) {
      from++;
    }
  }
  if (from_end) {
    while (to > from && is_trim_space(str->data[to - 1])) {
      to--;
    }
  }
  return substr(str, from, to);
}

jsrt_value jsrt_string_trim(jsrt_value s) { return trim_impl(s, true, true); }
jsrt_value jsrt_string_trim_start(jsrt_value s) { return trim_impl(s, true, false); }
jsrt_value jsrt_string_trim_end(jsrt_value s) { return trim_impl(s, false, true); }

jsrt_value jsrt_string_repeat(jsrt_value s, jsrt_value n) {
  const JSString *str = str_of(s);
  double count = jsrt_int_or_inf(n, 0.0);
  if (count < 0.0 || isinf(count)) {
    /* §22.1.3.19 throws a catchable RangeError here, and the builtin call protocol cannot raise
     * one yet -- landing pads exist, but no builtin participates. Loudly not-yet, never a wrong
     * answer or an uncatchable difference from Node's control flow. */
    jsrt_panic("STA2005: String.prototype.repeat with a negative or infinite count must throw "
               "RangeError; builtins cannot throw yet");
  }
  if (count * (double)str->length > 2147483647.0) {
    jsrt_panic("STA2005: String.prototype.repeat result is too large; builtins cannot throw yet");
  }
  uint32_t times = (uint32_t)count;
  JSString *out = alloc_str(times * str->length);
  for (uint32_t k = 0; k < times; k++) {
    memcpy(out->data + (size_t)k * str->length, str->data,
           (size_t)str->length * sizeof(uint16_t));
  }
  return box_str(out);
}

static jsrt_value pad_impl(jsrt_value s, jsrt_value target, jsrt_value pad, bool at_start) {
  const JSString *str = str_of(s);
  double want = jsrt_int_or_inf(target, 0.0);
  if (want <= (double)str->length) {
    return s;
  }
  if (want > 2147483647.0) {
    jsrt_panic("STA2005: String.prototype.pad result is too large; builtins cannot throw yet");
  }
  /* The default filler is one SPACE; an explicitly empty filler answers the string unchanged. */
  const JSString *fill = pad == JSRT_UNDEFINED ? NULL : str_of(pad);
  static const uint16_t space = 0x0020;
  const uint16_t *fill_data = fill == NULL ? &space : fill->data;
  uint32_t fill_len = fill == NULL ? 1 : fill->length;
  if (fill_len == 0) {
    return s;
  }
  uint32_t total = (uint32_t)want;
  uint32_t padding = total - str->length;
  JSString *out = alloc_str(total);
  uint16_t *dst = at_start ? out->data : out->data + str->length;
  for (uint32_t k = 0; k < padding; k++) {
    dst[k] = fill_data[k % fill_len];
  }
  memcpy(at_start ? out->data + padding : out->data, str->data,
         (size_t)str->length * sizeof(uint16_t));
  return box_str(out);
}

jsrt_value jsrt_string_pad_start(jsrt_value s, jsrt_value target, jsrt_value pad) {
  return pad_impl(s, target, pad, true);
}

jsrt_value jsrt_string_pad_end(jsrt_value s, jsrt_value target, jsrt_value pad) {
  return pad_impl(s, target, pad, false);
}

/* Scratch array for split's segments. Under Boehm this MUST be GC_MALLOC: the collector scans
 * its own heap but never the plain-malloc heap, and this scratch holds the only references to
 * the freshly-built segment strings until jsrt_array_new copies them out. */
static jsrt_value *items_alloc(uint32_t count) {
  size_t size = (size_t)(count == 0 ? 1 : count) * sizeof(jsrt_value);
  jsrt_value *items = (jsrt_value *)jsrt_gc_alloc(size, "string split");
  return items;
}

static void items_free(jsrt_value *items) {
#ifdef JSRT_HAVE_BOEHM
  (void)items; /* the collector owns it */
#else
  free(items);
#endif
}

/* §22.1.3.22: `search` has no string form at all -- the spec makes a RegExp out of whatever it is
 * given, and this compiler has no constructor to make one with, so the gate admits a regexp only
 * and the tag check here is the honest floor under an untyped one. */
jsrt_value jsrt_string_search(jsrt_value s, jsrt_value re) {
  if (!jsrt_is_regexp(re)) {
    jsrt_panic("STA2005: String.prototype.search with anything but a regular expression is not "
               "yet supported");
  }
  return jsrt_regexp_search(re, s);
}

/* §22.1.3.13: `s.match(x)` is `x[@@match](s)`, and every path to it goes through the ENGINE. A
 * non-regexp argument would first be RegExp-constructed from it, which is a conversion this bridge
 * does not perform -- the gate accepts only a regexp today. */
jsrt_value jsrt_string_match(jsrt_value s, jsrt_value re) {
  if (!jsrt_is_regexp(re)) {
    jsrt_panic("STA2005: String.prototype.match with anything but a regular expression is not "
               "yet supported");
  }
  return jsrt_regexp_match(re, s);
}

jsrt_value jsrt_string_match_all(jsrt_value s, jsrt_value re) {
  if (!jsrt_is_regexp(re)) {
    jsrt_panic("STA2005: String.prototype.matchAll with anything but a regular expression is not "
               "yet supported");
  }
  return jsrt_regexp_match_all(re, s);
}

jsrt_value jsrt_string_split(jsrt_value s, jsrt_value sep) {
  /* A regexp separator is the ENGINE's algorithm, not this file's: it scans rather than searching
   * for a fixed substring, and its capture groups land in the ANSWER. */
  if (jsrt_is_regexp(sep)) {
    return jsrt_regexp_split(sep, s);
  }
  const JSString *str = str_of(s);
  /* No separator: one element holding the whole string (§22.1.3.23 step 4). */
  if (sep == JSRT_UNDEFINED) {
    return jsrt_array_new(1, &s);
  }
  const JSString *by = str_of(sep);
  /* An empty separator splits into single code units -- and an empty STRING answers the empty
   * array, not [""], which is the one asymmetry in the algorithm. */
  if (by->length == 0) {
    uint32_t count = str->length;
    jsrt_value *items = items_alloc(count);
    for (uint32_t k = 0; k < count; k++) {
      items[k] = substr(str, k, k + 1);
    }
    jsrt_value out = jsrt_array_new(count, items);
    items_free(items);
    return out;
  }
  if (str->length == 0) {
    jsrt_value empty = box_str(alloc_str(0));
    /* "".split(x) for non-empty x is [""] -- the separator cannot match inside nothing. */
    return jsrt_array_new(1, &empty);
  }
  /* Two passes: count, then fill. The segment list is bounded by length + 1. */
  uint32_t count = 0;
  int64_t at = 0;
  while (at <= (int64_t)str->length) {
    int64_t hit = index_of_from(str, by, (uint32_t)at);
    count++;
    if (hit < 0) {
      break;
    }
    at = hit + (int64_t)by->length;
  }
  jsrt_value *items = items_alloc(count);
  uint32_t filled = 0;
  uint32_t start = 0;
  while (filled + 1 < count) {
    int64_t hit = index_of_from(str, by, start);
    items[filled++] = substr(str, start, (uint32_t)hit);
    start = (uint32_t)hit + by->length;
  }
  items[filled++] = substr(str, start, str->length);
  jsrt_value out = jsrt_array_new(count, items);
  items_free(items);
  return out;
}

/* GetSubstitution (§22.1.3.18.1) for a STRING pattern: $$, $&, $` and $' are live; $n and
 * $<name> stay literal because a string match has no capture groups. Implemented rather than
 * refused -- Node honors these in string replacements too, and a silent literal copy would be a
 * wrong answer for exactly the replacements that use them. */
static void substitution_length(const JSString *rep, const JSString *hay, const JSString *pat,
                                uint32_t pos, uint32_t *out_len) {
  uint32_t len = 0;
  for (uint32_t k = 0; k < rep->length; k++) {
    if (rep->data[k] == '$' && k + 1 < rep->length) {
      uint16_t next = rep->data[k + 1];
      if (next == '$') {
        len += 1;
        k++;
        continue;
      }
      if (next == '&') {
        len += pat->length;
        k++;
        continue;
      }
      if (next == '`') {
        len += pos;
        k++;
        continue;
      }
      if (next == '\'') {
        len += hay->length - (pos + pat->length);
        k++;
        continue;
      }
    }
    len += 1;
  }
  *out_len = len;
}

static uint32_t emit_units(uint16_t *dst, uint32_t at, const uint16_t *src, uint32_t n) {
  if (n > 0) {
    memcpy(dst + at, src, (size_t)n * sizeof(uint16_t));
  }
  return at + n;
}

static uint32_t substitution_emit(uint16_t *dst, uint32_t at, const JSString *rep,
                                  const JSString *hay, const JSString *pat, uint32_t pos) {
  for (uint32_t k = 0; k < rep->length; k++) {
    if (rep->data[k] == '$' && k + 1 < rep->length) {
      uint16_t next = rep->data[k + 1];
      if (next == '$') {
        dst[at++] = '$';
        k++;
        continue;
      }
      if (next == '&') {
        at = emit_units(dst, at, pat->data, pat->length);
        k++;
        continue;
      }
      if (next == '`') {
        at = emit_units(dst, at, hay->data, pos);
        k++;
        continue;
      }
      if (next == '\'') {
        at = emit_units(dst, at, hay->data + pos + pat->length,
                        hay->length - (pos + pat->length));
        k++;
        continue;
      }
    }
    dst[at++] = rep->data[k];
  }
  return at;
}

static jsrt_value replace_impl(jsrt_value s, jsrt_value pattern, jsrt_value replacement,
                               bool all) {
  const JSString *hay = str_of(s);
  const JSString *pat = str_of(pattern);
  const JSString *rep = str_of(replacement);
  /* Non-overlapping matches; an empty pattern advances by one (§22.1.3.18: advanceBy is
   * max(1, patLen)), which is also what stops the scan from standing still. */
  uint32_t advance = pat->length > 0 ? pat->length : 1;

  uint32_t matches = 0;
  uint32_t scan = 0;
  while (scan <= hay->length && index_of_from(hay, pat, scan) >= 0) {
    int64_t hit = index_of_from(hay, pat, scan);
    matches++;
    scan = (uint32_t)hit + advance;
    if (!all) {
      break;
    }
  }
  if (matches == 0) {
    return s;
  }

  uint32_t total = 0;
  uint32_t tail_start = 0;
  scan = 0;
  for (uint32_t m = 0; m < matches; m++) {
    int64_t hit = index_of_from(hay, pat, scan);
    uint32_t sub_len;
    substitution_length(rep, hay, pat, (uint32_t)hit, &sub_len);
    total += ((uint32_t)hit - tail_start) + sub_len;
    tail_start = (uint32_t)hit + pat->length;
    scan = (uint32_t)hit + advance;
  }
  total += hay->length - tail_start;

  JSString *out = alloc_str(total);
  uint32_t at = 0;
  tail_start = 0;
  scan = 0;
  for (uint32_t m = 0; m < matches; m++) {
    int64_t hit = index_of_from(hay, pat, scan);
    at = emit_units(out->data, at, hay->data + tail_start, (uint32_t)hit - tail_start);
    at = substitution_emit(out->data, at, rep, hay, pat, (uint32_t)hit);
    tail_start = (uint32_t)hit + pat->length;
    scan = (uint32_t)hit + advance;
  }
  emit_units(out->data, at, hay->data + tail_start, hay->length - tail_start);
  return box_str(out);
}

/* The same split in both directions: a regexp pattern is a scan the engine performs, and its
 * `$n` substitutions name capture groups a fixed substring does not have. */
jsrt_value jsrt_string_replace(jsrt_value s, jsrt_value pattern, jsrt_value replacement) {
  return jsrt_is_regexp(pattern) ? jsrt_regexp_replace(pattern, s, replacement, false)
                                 : replace_impl(s, pattern, replacement, false);
}

jsrt_value jsrt_string_replace_all(jsrt_value s, jsrt_value pattern, jsrt_value replacement) {
  return jsrt_is_regexp(pattern) ? jsrt_regexp_replace(pattern, s, replacement, true)
                                 : replace_impl(s, pattern, replacement, true);
}

/* ASCII is the whole of the mapping for an ASCII string, and staying here for one avoids decoding
 * and re-encoding a string that cannot change shape. Anything above it is the real tables' work:
 * case mapping is defined on CODE POINTS, a single one can map to three, and `Sigma` depends on
 * what surrounds it -- none of which a per-unit walk can express (jsrt_unicode.c). */
static jsrt_value case_impl(jsrt_value s, bool upper) {
  const JSString *str = str_of(s);
  for (uint32_t k = 0; k < str->length; k++) {
    if (str->data[k] > 0x7F) {
      return jsrt_unicode_case(s, upper);
    }
  }
  JSString *out = alloc_str(str->length);
  for (uint32_t k = 0; k < str->length; k++) {
    const uint16_t c = str->data[k];
    if (upper) {
      out->data[k] = c >= 'a' && c <= 'z' ? (uint16_t)(c - 32) : c;
    } else {
      out->data[k] = c >= 'A' && c <= 'Z' ? (uint16_t)(c + 32) : c;
    }
  }
  return box_str(out);
}

jsrt_value jsrt_string_to_upper_case(jsrt_value s) { return case_impl(s, true); }
jsrt_value jsrt_string_to_lower_case(jsrt_value s) { return case_impl(s, false); }

jsrt_value jsrt_string_normalize(jsrt_value s, jsrt_value form) {
  return jsrt_unicode_normalize(s, form);
}
