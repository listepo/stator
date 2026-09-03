/* jsrt_print.c — number->string conversion and console.log output.
 *
 * Two functions with deliberately different behaviour (docs/VALUE.md §3.3):
 *   jsrt_print     — console.log semantics, prints -0 as "-0" (Node's util.inspect rule)
 *   jsrt_to_string — ECMA-262 ToString, where -0 is "0"
 *
 * Printing an ARRAY is a third thing again, and not derivable from either: `console.log([1,'a'])`
 * is `[ 1, 'a' ]` — the string is quoted inside an array and bare at the top level, and the layout
 * (single line, wrapped, or column-aligned) follows Node's util.inspect rather than any clause of
 * ECMA-262. Golden tests compare stdout byte-for-byte, so that algorithm is reproduced here
 * exactly, constants included; §4.4 of docs/VALUE.md records where each constant came from.
 *
 * Number formatting implements ECMA-262 Number::toString(x, 10) literally, because the
 * surrounding FORMAT is where the traps are, not the digits (docs/VALUE.md §3.2):
 *   - the decimal/exponential threshold is 1e21, far above any C library's
 *   - negative exponents are written "1e-7" with NO zero padding
 *   - "%g" is unusable: it switches to exponential on its own criteria, so it prints
 *     100 as "1e+02" and 1e20 as "1e+20" where JS prints "100" and "100000000000000000000"
 */

#include "jsrt_value.h"

#include "jsrt.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* ============================================================================
 * Shortest round-trip digits
 * ============================================================================ */

/* Decompose a finite, strictly positive double into ECMA-262 step 5's (s, k, n):
 *   digits — the decimal digits of s, NUL-terminated, no sign and no point
 *   *k     — how many digits there are
 *   *n     — position of the decimal point, i.e. value == 0.digits * 10^n
 *
 * ponytail: the digits come from a round-trip search over "%.*e" rather than from Ryu,
 * which is not yet vendored (no network access; plan.md §5 Task 2.5). This is correct but
 * does up to 18 snprintf+strtod pairs per number. Replacing it means calling Ryu's
 * d2s_buffered and parsing the same "d.dddde+XX" shape — this function's contract, and every
 * caller below, stays exactly as it is. That is why the split lives here.
 *
 * The search is over SIGNIFICANT digits, so the shortest p that round-trips gives the
 * smallest k -- which is precisely what step 5 asks for. */
static void shortest_digits(double d, char *digits, size_t digits_len, int *k, int *n) {
  char temp[64];
  int p = 17;
  for (int try_p = 0; try_p <= 17; try_p++) {
    snprintf(temp, sizeof temp, "%.*e", try_p, d);
    if (strtod(temp, NULL) == d) {
      p = try_p;
      break;
    }
  }
  snprintf(temp, sizeof temp, "%.*e", p, d);

  /* temp is "D.DDDDe±XX" (or "De±XX" when p == 0). Split at 'e'. */
  char *e = strchr(temp, 'e');
  int exponent = (e != NULL) ? (int)strtol(e + 1, NULL, 10) : 0;
  if (e != NULL) {
    *e = '\0';
  }

  size_t out = 0;
  for (const char *c = temp; *c != '\0'; c++) {
    if (*c >= '0' && *c <= '9' && out + 1 < digits_len) {
      digits[out++] = *c;
    }
  }
  digits[out] = '\0';

  /* Trailing zeros can survive when the round-trip succeeded at a p larger than needed for
   * this particular value (e.g. "1.50e+00"); step 5 wants k minimal, so drop them. Never
   * drop the last digit -- "0" itself is handled by the caller. */
  while (out > 1 && digits[out - 1] == '0') {
    digits[--out] = '\0';
  }

  *k = (int)out;
  *n = exponent + 1; /* "D.DDD e±XX" has its point after 1 digit, so n = XX + 1 */
}

/* Write ECMA-262 Number::toString(d) for a finite, strictly positive d. */
static void format_positive(double d, char *buf, size_t buflen) {
  char digits[32];
  int k = 0;
  int n = 0;
  shortest_digits(d, digits, sizeof digits, &k, &n);

  static const char ZEROS[22] = "000000000000000000000"; /* n <= 21 bounds every run below */

  if (k <= n && n <= 21) {
    /* Step 6: all digits, then n-k zeros. This is the case "%g" gets wrong: it would give
     * 1e20 as "1e+20" where JS wants the twenty-one digits. */
    snprintf(buf, buflen, "%s%.*s", digits, n - k, ZEROS);
  } else if (0 < n && n <= 21) {
    /* Step 7: point inside the digits. */
    snprintf(buf, buflen, "%.*s.%s", n, digits, digits + n);
  } else if (-6 < n && n <= 0) {
    /* Step 8: "0." then -n zeros then the digits. */
    snprintf(buf, buflen, "0.%.*s%s", -n, ZEROS, digits);
  } else if (k == 1) {
    /* Step 9, single digit: "1e+21", "1e-7". The sign is always present and the exponent is
     * NEVER zero-padded -- "1e-07" would be a C habit, not JS. */
    snprintf(buf, buflen, "%se%c%d", digits, (n > 0) ? '+' : '-', abs(n - 1));
  } else {
    /* Step 10, multiple digits: "1.5e+21". */
    snprintf(buf, buflen, "%c.%se%c%d", digits[0], digits + 1, (n > 0) ? '+' : '-', abs(n - 1));
  }
}

/* negative_zero_visible distinguishes the two callers: console.log shows -0, ToString does not
 * (docs/VALUE.md §3.3). Everything else about the two is identical. */
static void format_double(double d, char *buf, size_t buflen, bool negative_zero_visible) {
  if (isnan(d)) {
    snprintf(buf, buflen, "NaN");
    return;
  }
  if (isinf(d)) {
    snprintf(buf, buflen, d < 0 ? "-Infinity" : "Infinity");
    return;
  }
  if (d == 0.0) {
    snprintf(buf, buflen, (negative_zero_visible && signbit(d)) ? "-0" : "0");
    return;
  }
  if (d < 0.0) {
    char rest[64];
    format_positive(-d, rest, sizeof rest);
    snprintf(buf, buflen, "-%s", rest);
    return;
  }
  format_positive(d, buf, buflen);
}

/* ============================================================================
 * Output buffer
 * ============================================================================ */

/* A growable byte buffer. Array layout cannot be decided until every element has been rendered
 * and measured, so output is built up rather than streamed. Plain malloc on purpose: this holds
 * bytes, never jsrt_values, so it is not something the collector needs to see. */
typedef struct {
  char *data;
  size_t len;
  size_t cap;
} Buf;

static void buf_init(Buf *b) {
  b->data = NULL;
  b->len = 0;
  b->cap = 0;
}

static void buf_free(Buf *b) {
  free(b->data);
  buf_init(b);
}

static void buf_append(Buf *b, const char *bytes, size_t n) {
  if (b->len + n + 1 > b->cap) {
    size_t cap = b->cap == 0 ? 64 : b->cap;
    while (b->len + n + 1 > cap) {
      cap *= 2;
    }
    char *grown = (char *)realloc(b->data, cap);
    if (grown == NULL) {
      jsrt_panic("out of memory: print buffer");
    }
    b->data = grown;
    b->cap = cap;
  }
  memcpy(b->data + b->len, bytes, n);
  b->len += n;
  b->data[b->len] = '\0';
}

static void buf_puts(Buf *b, const char *s) {
  buf_append(b, s, strlen(s));
}

static void buf_putc(Buf *b, char c) {
  buf_append(b, &c, 1);
}

static void buf_repeat(Buf *b, char c, size_t n) {
  for (size_t i = 0; i < n; i++) {
    buf_putc(b, c);
  }
}

/* ============================================================================
 * UTF-16 -> UTF-8 output
 * ============================================================================ */

/* Appends one JSString as UTF-8. Unpaired surrogates become U+FFFD: they cannot be represented in
 * well-formed UTF-8, and a JS string is allowed to contain them. */
static void append_string(Buf *out, const JSString *str) {
  for (uint32_t i = 0; i < str->length; i++) {
    uint32_t cp = str->data[i];

    if (cp >= 0xD800u && cp <= 0xDBFFu && i + 1 < str->length) {
      uint32_t low = str->data[i + 1];
      if (low >= 0xDC00u && low <= 0xDFFFu) {
        cp = 0x10000u + ((cp - 0xD800u) << 10) + (low - 0xDC00u);
        i++;
      }
    }
    if (cp >= 0xD800u && cp <= 0xDFFFu) {
      cp = 0xFFFDu; /* lone surrogate */
    }

    if (cp < 0x80u) {
      buf_putc(out, (char)cp);
    } else if (cp < 0x800u) {
      buf_putc(out, (char)(0xC0u | (cp >> 6)));
      buf_putc(out, (char)(0x80u | (cp & 0x3Fu)));
    } else if (cp < 0x10000u) {
      buf_putc(out, (char)(0xE0u | (cp >> 12)));
      buf_putc(out, (char)(0x80u | ((cp >> 6) & 0x3Fu)));
      buf_putc(out, (char)(0x80u | (cp & 0x3Fu)));
    } else {
      buf_putc(out, (char)(0xF0u | (cp >> 18)));
      buf_putc(out, (char)(0x80u | ((cp >> 12) & 0x3Fu)));
      buf_putc(out, (char)(0x80u | ((cp >> 6) & 0x3Fu)));
      buf_putc(out, (char)(0x80u | (cp & 0x3Fu)));
    }
  }
}

/* ============================================================================
 * util.inspect — the form a value takes INSIDE an array
 * ============================================================================ */

/* Node's defaults for console.log, each confirmed against the pinned Node rather than assumed:
 * an array breaks across lines past 80 columns, stops recursing below depth 2 ("[Array]"), and
 * shows at most 100 elements before "... n more items". */
#define INSPECT_BREAK_LENGTH 80
#define INSPECT_MAX_DEPTH 2
#define INSPECT_MAX_ARRAY 100
/* `compact: 3`, used only as `compact * 4` when capping columns. The other use of `compact` --
 * whether a nested value may share one line -- cannot fail while the depth cap is 2, because the
 * height of any surviving subtree is then at most 2, which is already below 3. */
#define INSPECT_COMPACT 3
#define SEPARATOR_SPACE 2 /* ", " between two entries */

static void inspect_value(Buf *out, jsrt_value v, int recurse, size_t indent);
static void append_key(Buf *out, const char *key);

/* Quoting follows Node: single quotes, unless the string contains one and no double quote, and
 * backticks only when it contains both. The quote actually chosen is then the only quote that
 * needs escaping inside. */
static void append_quoted(Buf *out, const JSString *str) {
  bool has_single = false;
  bool has_double = false;
  bool has_backtick = false;
  for (uint32_t i = 0; i < str->length; i++) {
    has_single = has_single || str->data[i] == '\'';
    has_double = has_double || str->data[i] == '"';
    has_backtick = has_backtick || str->data[i] == '`';
  }
  char quote = '\'';
  if (has_single) {
    quote = !has_double ? '"' : (!has_backtick ? '`' : '\'');
  }

  buf_putc(out, quote);
  for (uint32_t i = 0; i < str->length; i++) {
    uint16_t c = str->data[i];
    if (c == (uint16_t)quote || c == '\\') {
      buf_putc(out, '\\');
      buf_putc(out, (char)c);
    } else if (c == '\n') {
      buf_puts(out, "\\n");
    } else if (c == '\t') {
      buf_puts(out, "\\t");
    } else if (c == '\r') {
      buf_puts(out, "\\r");
    } else if (c == '\b') {
      buf_puts(out, "\\b");
    } else if (c == '\f') {
      buf_puts(out, "\\f");
    } else if (c == 0x0B) {
      buf_puts(out, "\\v");
    } else if (c < 0x20 || c == 0x7F) {
      char hex[8];
      snprintf(hex, sizeof hex, "\\x%02X", c);
      buf_puts(out, hex);
    } else {
      /* Hand the code unit -- with its partner, when it starts a surrogate pair -- to the same
       * UTF-8 writer the unquoted path uses, so a pair still comes out as one code point. A
       * JSString ends in a flexible member, so the stand-in is a byte array shaped like one. */
      _Alignas(JSString) unsigned char storage[sizeof(JSString) + 2 * sizeof(uint16_t)];
      JSString *piece = (JSString *)storage;
      const bool pair = c >= 0xD800u && c <= 0xDBFFu && i + 1 < str->length;
      piece->length = pair ? 2 : 1;
      piece->data[0] = c;
      if (pair) {
        piece->data[1] = str->data[i + 1];
        i++;
      }
      append_string(out, piece);
    }
  }
  buf_putc(out, quote);
}

/* Everything that is not an array renders the same inside an array as it does at the top level,
 * except a string, which is quoted here and bare there. */
static void inspect_scalar(Buf *out, jsrt_value v, bool quote_strings) {
  char buf[64];

  if (jsrt_is_double(v)) {
    format_double(jsrt_to_double(v), buf, sizeof buf, true);
    buf_puts(out, buf);
  } else if (jsrt_is(v, JSRT_TAG_STRING)) {
    const JSString *str = (const JSString *)jsrt_ptr(v);
    if (quote_strings) {
      append_quoted(out, str);
    } else {
      append_string(out, str);
    }
  } else if (jsrt_is(v, JSRT_TAG_BOOL)) {
    buf_puts(out, jsrt_as_bool(v) ? "true" : "false");
  } else if (jsrt_is(v, JSRT_TAG_NULL)) {
    buf_puts(out, "null");
  } else if (jsrt_is(v, JSRT_TAG_UNDEFINED)) {
    buf_puts(out, "undefined");
  } else if (jsrt_is(v, JSRT_TAG_INT32)) {
    snprintf(buf, sizeof buf, "%d", jsrt_as_int32(v));
    buf_puts(out, buf);
  } else if (jsrt_is(v, JSRT_TAG_CLOSURE)) {
    const char *name = jsrt_as_closure(v)->name;
    if (name[0] == '\0') {
      buf_puts(out, "[Function (anonymous)]");
    } else {
      snprintf(buf, sizeof buf, "[Function: %s]", name);
      buf_puts(out, buf);
    }
  } else {
    buf_puts(out, "[object Object]");
  }
}

/* Node's groupArrayElements: above six entries, short ones are laid out in aligned columns rather
 * than one per line. Returns the number of rows written into `rows`, or 0 when the shape does not
 * qualify and the caller should keep the entries as they are.
 *
 * `count` counts the entries that hold elements; a trailing "... n more items" is excluded from
 * the grouping and appended afterwards, which is why it is passed separately as `total`. */
static size_t group_entries(const Buf *entries, size_t count, size_t total, size_t indent,
                            bool all_numbers, Buf *rows) {
  size_t total_length = 0;
  size_t max_length = 0;
  for (size_t i = 0; i < count; i++) {
    total_length += entries[i].len + SEPARATOR_SPACE;
    if (entries[i].len > max_length) {
      max_length = entries[i].len;
    }
  }

  const size_t actual_max = max_length + SEPARATOR_SPACE;
  /* Group only when at least three entries fit side by side, and only when the entries are of
   * comparable size -- otherwise one long entry would stretch every column to its width. */
  if (!(actual_max * 3 + indent < INSPECT_BREAK_LENGTH &&
        ((double)total_length / (double)actual_max > 5.0 || max_length <= 6))) {
    return 0;
  }

  const double approx_char_heights = 2.5;
  const double average_bias = sqrt((double)actual_max - (double)total_length / (double)total);
  const double biased_max = fmax((double)actual_max - 3.0 - average_bias, 1.0);

  /* Aim for a square block: the sqrt is the side of a square holding `count` cells that are
   * about 2.5 times taller than wide. The other three terms are hard caps. */
  double ideal = round(sqrt(approx_char_heights * biased_max * (double)count) / biased_max);
  size_t columns = (size_t)ideal;
  const size_t fits = (INSPECT_BREAK_LENGTH - indent) / actual_max;
  if (columns > fits) {
    columns = fits;
  }
  if (columns > INSPECT_COMPACT * 4) {
    columns = INSPECT_COMPACT * 4;
  }
  if (columns > 15) {
    columns = 15;
  }
  if (columns <= 1) {
    return 0;
  }

  /* Every column is as wide as its widest member, so the commas line up down the block. */
  size_t *column_width = (size_t *)calloc(columns, sizeof(size_t));
  if (column_width == NULL) {
    jsrt_panic("out of memory: print buffer");
  }
  for (size_t i = 0; i < columns; i++) {
    size_t width = 0;
    for (size_t j = i; j < count; j += columns) {
      if (entries[j].len > width) {
        width = entries[j].len;
      }
    }
    column_width[i] = width + SEPARATOR_SPACE;
  }

  /* Numbers are right-aligned so their digits line up; anything else is left-aligned. */
  size_t rows_written = 0;
  for (size_t i = 0; i < count; i += columns) {
    const size_t max = (i + columns < count) ? i + columns : count;
    Buf *row = &rows[rows_written++];
    buf_init(row);
    size_t j = i;
    for (; j + 1 < max; j++) {
      const size_t padding = column_width[j - i];
      const size_t written = entries[j].len + SEPARATOR_SPACE;
      if (all_numbers && padding > written) {
        buf_repeat(row, ' ', padding - written);
      }
      buf_append(row, entries[j].data, entries[j].len);
      buf_puts(row, ", ");
      if (!all_numbers && padding > written) {
        buf_repeat(row, ' ', padding - written);
      }
    }
    /* The last entry on a row carries no separator, so its column is two narrower. */
    if (all_numbers) {
      const size_t padding = column_width[j - i] - SEPARATOR_SPACE;
      if (padding > entries[j].len) {
        buf_repeat(row, ' ', padding - entries[j].len);
      }
    }
    buf_append(row, entries[j].data, entries[j].len);
  }

  free(column_width);
  return rows_written;
}

/* True when laying the entries out on one line stays inside the break length. Mirrors Node's
 * isBelowBreakLength, including the constant 10 it adds to leave room for whatever surrounds the
 * value, and the separate check that the separators alone do not overflow. */
/* `prefix` is Node's `braces[0].length + base.length`: one for the bracket or brace, plus the class
 * name a class instance prints in front of it. A longer name really does make the same fields break
 * onto separate lines, so it has to be in the budget. */
static bool fits_one_line(const Buf *entries, size_t count, size_t indent, size_t prefix) {
  const size_t start = count + indent + prefix + 10;
  size_t total = count + start;
  if (total + count > INSPECT_BREAK_LENGTH) {
    return false;
  }
  for (size_t i = 0; i < count; i++) {
    if (entries[i].len > 0 && memchr(entries[i].data, '\n', entries[i].len) != NULL) {
      return false;
    }
    total += entries[i].len;
    if (total > INSPECT_BREAK_LENGTH) {
      return false;
    }
  }
  return true;
}

/* The brace layout objects and Map/Set share: entries joined one-line inside `{ }` when the line
 * budget holds, one entry per line at indent+2 otherwise. Consumes (frees) the entry buffers. */
static void emit_braced(Buf *out, Buf *entries, size_t count, size_t indent, size_t prefix) {
  if (fits_one_line(entries, count, indent, prefix)) {
    buf_puts(out, "{ ");
    for (size_t i = 0; i < count; i++) {
      if (i > 0) {
        buf_puts(out, ", ");
      }
      buf_append(out, entries[i].data, entries[i].len);
    }
    buf_puts(out, " }");
  } else {
    buf_puts(out, "{\n");
    for (size_t i = 0; i < count; i++) {
      if (i > 0) {
        buf_puts(out, ",\n");
      }
      buf_repeat(out, ' ', indent + 2);
      buf_append(out, entries[i].data, entries[i].len);
    }
    buf_putc(out, '\n');
    buf_repeat(out, ' ', indent);
    buf_putc(out, '}');
  }

  for (size_t i = 0; i < count; i++) {
    buf_free(&entries[i]);
  }
  free(entries);
}


static void inspect_array(Buf *out, jsrt_value v, int recurse, size_t indent) {
  if (recurse > INSPECT_MAX_DEPTH) {
    buf_puts(out, "[Array]");
    return;
  }

  const JSRTArray *a = jsrt_as_array(v);
  const uint32_t length = a->length;
  const size_t shown = length > INSPECT_MAX_ARRAY ? INSPECT_MAX_ARRAY : length;
  const bool truncated = length > shown;
  /* A RegExp match is an array with NAMED properties, and Node prints them after the elements:
   * `[ 'a', index: 0, input: 'a', groups: undefined ]`. Every other array has none, so this is
   * zero and nothing below it changes. */
  const size_t props = jsrt_shape_property_count(a->shape);
  const size_t count = shown + (truncated ? 1 : 0) + props;

  if (count == 0) {
    buf_puts(out, "[]");
    return;
  }

  Buf *entries = (Buf *)calloc(count, sizeof(Buf));
  if (entries == NULL) {
    jsrt_panic("out of memory: print buffer");
  }
  bool all_numbers = true;
  for (size_t i = 0; i < shown; i++) {
    buf_init(&entries[i]);
    /* Elements are rendered two columns deeper: that indent is what a multi-line layout uses,
     * and it also shortens the budget a nested array has before it breaks. */
    inspect_value(&entries[i], a->elements[i], recurse + 1, indent + 2);
    all_numbers = all_numbers && jsrt_is_number(a->elements[i]);
  }
  if (truncated) {
    char more[64];
    const uint32_t remaining = length - (uint32_t)shown;
    snprintf(more, sizeof more, "... %u more item%s", remaining, remaining == 1 ? "" : "s");
    buf_init(&entries[shown]);
    buf_puts(&entries[shown], more);
  }
  if (props > 0) {
    const JSRTShape **links = jsrt_shape_property_order(a->shape, (uint32_t)props);
    for (size_t i = 0; i < props; i++) {
      Buf *entry = &entries[shown + (truncated ? 1 : 0) + i];
      buf_init(entry);
      append_key(entry, links[i]->key);
      buf_puts(entry, ": ");
      inspect_value(entry, a->slots[links[i]->offset], recurse + 1, indent + 2);
    }
    free(links);
  }

  /* Grouping is attempted first, because whether it fired decides the layout below: if it changed
   * the number of lines, the single-line form is not even considered. */
  Buf *rows = NULL;
  size_t row_count = 0;
  if (count > 6 && props == 0) {
    rows = (Buf *)calloc(count, sizeof(Buf));
    if (rows == NULL) {
      jsrt_panic("out of memory: print buffer");
    }
    row_count = group_entries(entries, shown, count, indent, all_numbers, rows);
    if (row_count > 0 && truncated) {
      buf_init(&rows[row_count]);
      buf_append(&rows[row_count], entries[shown].data, entries[shown].len);
      row_count++;
    }
  }

  const Buf *lines = row_count > 0 ? rows : entries;
  const size_t line_count = row_count > 0 ? row_count : count;

  if (row_count == 0 && fits_one_line(entries, count, indent, 1 /* "[" */)) {
    buf_puts(out, "[ ");
    for (size_t i = 0; i < count; i++) {
      if (i > 0) {
        buf_puts(out, ", ");
      }
      buf_append(out, entries[i].data, entries[i].len);
    }
    buf_puts(out, " ]");
  } else {
    buf_puts(out, "[\n");
    for (size_t i = 0; i < line_count; i++) {
      if (i > 0) {
        buf_puts(out, ",\n");
      }
      buf_repeat(out, ' ', indent + 2);
      buf_append(out, lines[i].data, lines[i].len);
    }
    buf_putc(out, '\n');
    buf_repeat(out, ' ', indent);
    buf_putc(out, ']');
  }

  for (size_t i = 0; i < count; i++) {
    buf_free(&entries[i]);
  }
  free(entries);
  if (rows != NULL) {
    for (size_t i = 0; i < row_count; i++) {
      buf_free(&rows[i]);
    }
    free(rows);
  }
}

/* `Name { field: value, … }`.
 *
 * Structurally this is inspect_array with three differences, each of them a real rule rather than a
 * cosmetic one: the class name prints in front and counts toward the line budget; entries are
 * `name: value` rather than bare values; and there is NO grouping -- Node's groupArrayElements is
 * reached only for array-like output, so eight fields print as eight lines where eight numbers
 * would print as a grid.
 *
 * Field names are emitted bare. Node quotes a key that is not a valid identifier (`{ 'a-b': 1 }`),
 * but a class field's name is an identifier by construction, so the case cannot arise here; it
 * arrives with object literals, which can spell any key. */
/* A dynamic object's key prints bare only when it is a valid identifier; Node quotes the rest
 * (`{ 'a-b': 1 }`), choosing the quote by the same rule strings use. Class fields never take this
 * path -- their names are identifiers by construction. */
static bool key_is_identifier(const char *key) {
  if (key[0] == '\0') {
    return false;
  }
  for (size_t i = 0; key[i] != '\0'; i++) {
    const char c = key[i];
    const bool alpha = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == '$';
    if (!alpha && (i == 0 || c < '0' || c > '9')) {
      return false;
    }
  }
  return true;
}

static void append_key(Buf *out, const char *key) {
  if (key_is_identifier(key)) {
    buf_puts(out, key);
    return;
  }
  bool has_single = false;
  bool has_double = false;
  bool has_backtick = false;
  for (size_t i = 0; key[i] != '\0'; i++) {
    has_single = has_single || key[i] == '\'';
    has_double = has_double || key[i] == '"';
    has_backtick = has_backtick || key[i] == '`';
  }
  char quote = '\'';
  if (has_single) {
    quote = !has_double ? '"' : (!has_backtick ? '`' : '\'');
  }
  buf_putc(out, quote);
  for (size_t i = 0; key[i] != '\0'; i++) {
    if (key[i] == quote || key[i] == '\\') {
      buf_putc(out, '\\');
    }
    buf_putc(out, key[i]);
  }
  buf_putc(out, quote);
}

static void inspect_object(Buf *out, jsrt_value v, int recurse, size_t indent) {
  const JSRTObject *o = jsrt_as_object(v);
  const JSRTClass *cls = o->cls;

  /* A DYNAMIC object's layout lives in its shape, not its class: keys come from the shape chain,
   * values from the out-of-line slots, and insertion order is the chain reversed. Everything
   * below the collection step -- entries, budget, line breaking -- is shared with fixed-shape
   * objects, which is the point: the two print identically because Node cannot tell them apart. */
  const JSRTDynObject *dyn = jsrt_is_dynobj(v) ? (const JSRTDynObject *)o : NULL;

  /* An object LITERAL has no constructor name, and Node prints none: `{ x: 1 }`, not `Object
   * { x: 1 }`. Its descriptor carries the empty name, which is unambiguous -- no class may be
   * called "" -- and every place the name would print becomes a place it does not. A dynamic
   * object is a plain object and prints namelessly for the same reason. */
  /* The null-prototype object §22.2.7.2 builds for `groups` prints Node's marker where a class name
   * would go -- `[Object: null prototype] { w: 'a' }` -- and it counts toward the line budget the
   * same way. Every other nameless object (a literal, a plain dynamic object) still prints bare. */
  const char *const name = cls == &jsrt_class_null_proto  ? "[Object: null prototype]"
                           : cls->name[0] != '\0'         ? cls->name
                                                          : NULL;
  const bool named = name != NULL;

  if (recurse > INSPECT_MAX_DEPTH) {
    /* `[Deep]`, not `[Object]`: past the cap Node still names the constructor it stopped at --
     * and for a literal, which has no constructor, that name IS `Object`. */
    buf_putc(out, '[');
    buf_puts(out, named ? name : "Object");
    buf_putc(out, ']');
    return;
  }

  /* A `#private` field HAS a slot -- it is on the instance like any other field -- but
   * `util.inspect` does not show it, so neither does this. A leading '#' is the whole test, and it
   * is unambiguous: a class field's name is an identifier by construction, and no identifier can
   * start with one. Printing therefore walks the visible slots, not every slot. */
  size_t count = 0;
  if (dyn != NULL) {
    count = jsrt_shape_property_count(dyn->shape);
  } else {
    for (uint32_t i = 0; i < cls->field_count; i++) {
      if (cls->fields[i][0] != '#') {
        count++;
      }
    }
  }
  if (count == 0) {
    if (named) {
      buf_puts(out, name);
      buf_putc(out, ' ');
    }
    buf_puts(out, "{}");
    return;
  }

  Buf *entries = (Buf *)calloc(count, sizeof(Buf));
  if (entries == NULL) {
    jsrt_panic("out of memory: print buffer");
  }
  size_t next = 0;
  if (dyn != NULL) {
    /* Dynamic keys follow OrdinaryOwnPropertyKeys: integer indices first, then insertion order. */
    const JSRTShape **links = jsrt_shape_property_order(dyn->shape, (uint32_t)count);
    for (size_t i = 0; i < count; i++) {
      Buf *entry = &entries[next++];
      buf_init(entry);
      append_key(entry, links[i]->key);
      buf_puts(entry, ": ");
      inspect_value(entry, dyn->slots[links[i]->offset], recurse + 1, indent + 2);
    }
    free(links);
  } else {
    for (uint32_t i = 0; i < cls->field_count; i++) {
      /* Insertion order, not slot order: the two differ whenever the layout came from a type the
       * literal did not write in that order (jsrt_value.h, JSRTClass::key_order). */
      const uint32_t slot = jsrt_class_key_slot(cls, i);
      if (cls->fields[slot][0] == '#') {
        continue;
      }
      Buf *entry = &entries[next++];
      buf_init(entry);
      /* A class field's name is an identifier by construction, but an object literal's is only a
       * key: `{ "a-b": 1 }` has a fixed layout and a name no identifier could spell, and
       * `util.inspect` quotes exactly that. Same helper the dynamic path uses, so one rule
       * decides quoting for both. */
      append_key(entry, cls->fields[slot]);
      buf_puts(entry, ": ");
      inspect_value(entry, o->fields[slot], recurse + 1, indent + 2);
    }
  }

  /* The name and the space after it are part of the prefix Node measures, along with the `{`. A
   * literal contributes neither, so its budget is one character wider. */
  const size_t prefix = named ? strlen(name) + 1 /* the space */ + 1 : 1 /* "{" */;
  if (named) {
    buf_puts(out, name);
    buf_putc(out, ' ');
  }
  emit_braced(out, entries, count, indent, prefix);
}

/* `Map(2) { 'a' => 1, 'b' => 2 }` and `Set(2) { 1, 2 }`.
 *
 * Laid out like an object, not like an array: the size goes in front and counts toward the line
 * budget the way a class name does, and there is NO grouping, because Node reaches
 * groupArrayElements only for array-like output. A Set of eight numbers therefore prints as eight
 * lines where an ARRAY of eight numbers prints as a grid — the one place the two look different for
 * the same contents.
 *
 * Entries print in insertion order because that is what the structure stores; the dead ones a
 * deletion left behind are skipped here exactly as they are skipped by a lookup. */
static void inspect_map(Buf *out, jsrt_value v, int recurse, size_t indent) {
  const JSRTMap *m = jsrt_as_map(v);
  const bool is_map = m->cls == &jsrt_class_map;

  if (recurse > INSPECT_MAX_DEPTH) {
    buf_puts(out, is_map ? "[Map]" : "[Set]");
    return;
  }

  char base[32];
  snprintf(base, sizeof base, "%s(%u)", m->cls->name, m->size);
  buf_puts(out, base);
  buf_putc(out, ' ');

  const size_t shown = m->size > INSPECT_MAX_ARRAY ? INSPECT_MAX_ARRAY : m->size;
  const bool truncated = m->size > shown;
  const size_t count = shown + (truncated ? 1 : 0);
  if (count == 0) {
    buf_puts(out, "{}");
    return;
  }

  Buf *entries = (Buf *)calloc(count, sizeof(Buf));
  if (entries == NULL) {
    jsrt_panic("out of memory: print buffer");
  }
  size_t next = 0;
  for (uint32_t i = 0; i < m->used && next < shown; i++) {
    if (!m->entries[i].live) {
      continue;
    }
    Buf *entry = &entries[next++];
    buf_init(entry);
    inspect_value(entry, m->entries[i].key, recurse + 1, indent + 2);
    if (is_map) {
      buf_puts(entry, " => ");
      inspect_value(entry, m->entries[i].value, recurse + 1, indent + 2);
    }
  }
  if (truncated) {
    char more[64];
    const uint32_t remaining = m->size - (uint32_t)shown;
    snprintf(more, sizeof more, "... %u more item%s", remaining, remaining == 1 ? "" : "s");
    buf_init(&entries[shown]);
    buf_puts(&entries[shown], more);
  }

  /* The `Map(2)` and the space in front of it are Node's `base`, measured with the brace. */
  const size_t prefix = strlen(base) + 1 + 1;
  emit_braced(out, entries, count, indent, prefix);
}

/* `/source/flags` -- the literal a program would have written, which is what Node prints both at
 * the top level and inside a structure, and without quotes in either place. The source is already
 * in its escaped form: `jsrt_regexp_new` stores what it was given, and the one value that has no
 * spelling as a literal -- the empty pattern -- is normalized to `(?:)` there. */
static void inspect_regexp(Buf *out, jsrt_value v) {
  const JSRTRegExp *re = jsrt_as_regexp(v);
  buf_putc(out, '/');
  append_string(out, (const JSString *)jsrt_ptr(re->source));
  buf_putc(out, '/');
  append_string(out, (const JSString *)jsrt_ptr(re->flags));
}

static void inspect_value(Buf *out, jsrt_value v, int recurse, size_t indent);

/* `Promise { 42 }`, `Promise { <pending> }`, `Promise { <rejected> 'boom' }`. The settled value
 * is inspected, not printed bare -- a fulfilled string shows its quotes, exactly as it does inside
 * an array -- and the two angle-bracket forms are Node's own markers, not values. */
static void inspect_promise(Buf *out, jsrt_value v, int recurse, size_t indent) {
  const JSRTPromise *p = jsrt_as_promise(v);
  buf_puts(out, "Promise { ");
  if (p->state == JSRT_PROMISE_PENDING) {
    buf_puts(out, "<pending>");
  } else {
    if (p->state == JSRT_PROMISE_REJECTED) {
      buf_puts(out, "<rejected> ");
    }
    inspect_value(out, p->value, recurse + 1, indent);
  }
  buf_puts(out, " }");
}

/* Node prints a Date as its ISO string with NO quotes, at top level and nested alike --
 * `console.log(d)` is `2024-02-29T13:45:06.789Z` and `console.log([d])` is
 * `[ 2024-02-29T13:45:06.789Z ]`. An Invalid Date prints `Invalid Date`, which is why this cannot
 * simply call `jsrt_date_to_iso_string` (that one panics, per the spec's RangeError). */
static void inspect_date(Buf *out, jsrt_value v) {
  const jsrt_value text = jsrt_date_to_json(v);
  if (text == JSRT_NULL) {
    buf_puts(out, "Invalid Date");
    return;
  }
  append_string(out, (const JSString *)jsrt_ptr(text));
}

static void inspect_value(Buf *out, jsrt_value v, int recurse, size_t indent) {
  if (jsrt_is_date(v)) {
    inspect_date(out, v);
  } else if (jsrt_is_regexp(v)) {
    inspect_regexp(out, v);
  } else if (jsrt_is_promise(v)) {
    inspect_promise(out, v, recurse, indent);
  } else if (jsrt_is_map_or_set(v)) {
    inspect_map(out, v, recurse, indent);
  } else if (jsrt_is(v, JSRT_TAG_OBJECT)) {
    inspect_object(out, v, recurse, indent);
  } else if (jsrt_is(v, JSRT_TAG_ARRAY)) {
    inspect_array(out, v, recurse, indent);
  } else {
    inspect_scalar(out, v, true);
  }
}

/* ============================================================================
 * Public
 * ============================================================================ */

/* console.group's indentation, in GROUPS -- Node writes two spaces per level in front of every
 * line of every console write, including each line of a multi-line inspect. One counter for the
 * whole program: console has one output state, and the subset has no second console. */
static size_t group_depth = 0;

/* Write `text` with the group indent in front of every line. The text always ends in the newline
 * its writer appended, and Node does NOT indent past that final newline -- a blank line stays
 * blank -- so the prefix goes before each line that has content. */
static void write_grouped(const char *text, size_t len, FILE *stream) {
  if (group_depth == 0) {
    fwrite(text, 1, len, stream);
    return;
  }
  size_t line = 0;
  for (size_t i = 0; i < len; i++) {
    if (text[i] != '\n') {
      continue;
    }
    for (size_t g = 0; g < group_depth; g++) {
      fwrite("  ", 1, 2, stream);
    }
    fwrite(text + line, 1, i + 1 - line, stream);
    line = i + 1;
  }
  if (line < len) {
    for (size_t g = 0; g < group_depth; g++) {
      fwrite("  ", 1, 2, stream);
    }
    fwrite(text + line, 1, len - line, stream);
  }
}

/* `bare` is console.log's one exception to inspect form: a top-level string prints WITHOUT
 * quotes, so `console.log("a")` is `a` while `console.log(["a"])` is `[ 'a' ]`. console.dir has
 * no such exception -- it inspects whatever it is given, which is the whole difference between
 * the two entry points. */
static void print_to(jsrt_value v, FILE *stream, bool bare) {
  Buf out;
  buf_init(&out);

  if (jsrt_is_date(v)) {
    inspect_date(&out, v);
  } else if (jsrt_is_regexp(v)) {
    inspect_regexp(&out, v);
  } else if (jsrt_is_promise(v)) {
    inspect_promise(&out, v, 0, 0);
  } else if (jsrt_is_map_or_set(v)) {
    inspect_map(&out, v, 0, 0);
  } else if (jsrt_is(v, JSRT_TAG_OBJECT)) {
    inspect_object(&out, v, 0, 0);
  } else if (jsrt_is(v, JSRT_TAG_ARRAY)) {
    inspect_array(&out, v, 0, 0);
  } else {
    inspect_scalar(&out, v, !bare);
  }

  buf_putc(&out, '\n');
  write_grouped(out.data, out.len, stream);
  buf_free(&out);
}

void jsrt_print(jsrt_value v) { print_to(v, stdout, true); }

/* console.error / console.warn: the same inspect form, on stderr -- Node's own split, which is
 * why the golden runner compares BOTH streams byte-for-byte. */
void jsrt_eprint(jsrt_value v) { print_to(v, stderr, true); }

/* console.dir: inspect form with no bare-string exception. */
void jsrt_console_dir(jsrt_value v) { print_to(v, stdout, false); }

/* console.group(label) prints the label at the CURRENT indent and then indents; the label-less
 * form prints nothing and only indents. console.groupEnd() outdents, and bottoms out at zero --
 * an unmatched groupEnd is a no-op in Node, not an error. */
void jsrt_console_group(jsrt_value label) {
  /* The label is PRINTED, undefined included: `console.group(undefined)` writes "undefined" where
   * `console.group()` writes nothing, so the two forms are two entry points rather than one with
   * a sentinel. */
  jsrt_print(label);
  group_depth++;
}

void jsrt_console_group_bare(void) { group_depth++; }

void jsrt_console_group_end(void) {
  if (group_depth > 0) {
    group_depth--;
  }
}

/* console.count's per-label tallies. A linked list rather than a hash: the labels a program
 * counts are a handful of literals, and a list keeps the keys immortal for free -- the same
 * lifetime rule shape keys follow, and for the same reason (the table only grows). */
typedef struct CountEntry {
  const char *label;
  uint32_t count;
  struct CountEntry *next;
} CountEntry;

static CountEntry *counts = NULL;

/* The label as a C string. `console.count()` with no argument counts under "default", which is
 * the literal Node prints, not a placeholder. */
static const char *count_label(jsrt_value label) {
  return label == JSRT_UNDEFINED ? "default" : jsrt_shape_key(label);
}

static CountEntry *count_entry(const char *label) {
  for (CountEntry *e = counts; e != NULL; e = e->next) {
    if (e->label == label || strcmp(e->label, label) == 0) {
      return e;
    }
  }
  CountEntry *fresh = (CountEntry *)malloc(sizeof(CountEntry));
  if (fresh == NULL) {
    jsrt_panic("out of memory: console.count");
  }
  fresh->label = label;
  fresh->count = 0;
  fresh->next = counts;
  counts = fresh;
  return fresh;
}

/* Both entry points answer `undefined` -- console methods are void, and the emitter needs a
 * value-shaped result for the expression position a call sits in. */
static void count_print(const char *label, uint32_t count) {
  Buf out;
  buf_init(&out);
  buf_puts(&out, label);
  buf_puts(&out, ": ");
  char digits[16];
  snprintf(digits, sizeof digits, "%u", count);
  buf_puts(&out, digits);
  buf_putc(&out, '\n');
  write_grouped(out.data, out.len, stdout);
  buf_free(&out);
}

jsrt_value jsrt_console_count(jsrt_value label) {
  const char *name = count_label(label);
  CountEntry *entry = count_entry(name);
  entry->count++;
  count_print(name, entry->count);
  return JSRT_UNDEFINED;
}

/* countReset zeroes the tally and prints nothing, which is Node's behaviour for a label that
 * exists; a label that does not exist warns in Node, and warning is a diagnostic this runtime
 * has no channel for -- so an unknown label simply starts at zero, which is what the next
 * `count` on it would have done anyway. */
jsrt_value jsrt_console_count_reset(jsrt_value label) {
  count_entry(count_label(label))->count = 0;
  return JSRT_UNDEFINED;
}

/* console.time / console.timeEnd / console.trace -- the three console members under the
 * DETERMINISM CARVE-OUT (plan.md §7 Task 4.2, plan-notes 116/124). Every other builtin is proved
 * by a golden test that diffs stdout against the pinned Node byte-for-byte. These three cannot be:
 * a duration is a measurement of THIS machine on THIS run, and a stack is frames this runtime does
 * not have. "Matches Node" is not a property they HAVE, so they land with a shape assertion
 * (tests/unit/console-carveout.test.ts) instead, and the dashboard marks them nondeterministic.
 *
 * What IS pinned, and what the proof asserts: the label is echoed, a duration follows it, the unit
 * is `ms` below a second, and a timer that was never started prints nothing at all. */

/* Per-label start times. The same linked list `console.count` uses, for the same reason: the
 * labels a program times are a handful of literals, and the list keeps the keys immortal. */
typedef struct TimerEntry {
  const char *label;
  double started_ms;
  bool running;
  struct TimerEntry *next;
} TimerEntry;

static TimerEntry *timers = NULL;

/* A MONOTONIC clock, not a wall clock: `console.time` measures elapsed time, and a wall clock can
 * step backwards under NTP, which would print a negative duration for a program that did nothing
 * wrong. CLOCK_MONOTONIC is POSIX and present on both platforms the runtime builds for. */
static double monotonic_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1.0e6;
}

static TimerEntry *timer_entry(const char *label, bool create) {
  for (TimerEntry *e = timers; e != NULL; e = e->next) {
    if (e->label == label || strcmp(e->label, label) == 0) {
      return e;
    }
  }
  if (!create) {
    return NULL;
  }
  TimerEntry *fresh = (TimerEntry *)malloc(sizeof(TimerEntry));
  if (fresh == NULL) {
    jsrt_panic("out of memory: console.time");
  }
  fresh->label = label;
  fresh->started_ms = 0.0;
  fresh->running = false;
  fresh->next = timers;
  timers = fresh;
  return fresh;
}

/* Node's own unit ladder (`lib/internal/console/constructor.js`, `formatTime`): milliseconds below
 * a second, seconds below a minute, and `m:ss.mmm` with the format spelled out after it above one.
 * Reproduced rather than simplified to `ms` -- the VALUE cannot match Node, but the shape can, and
 * a ten-minute build printing `600000.000ms` would differ from Node in a way that is not the
 * measurement's fault. */
static void format_time(Buf *out, double ms) {
  char text[64];
  if (ms < 1000.0) {
    snprintf(text, sizeof text, "%.3fms", ms);
    buf_puts(out, text);
    return;
  }
  if (ms < 60000.0) {
    snprintf(text, sizeof text, "%.3fs", ms / 1000.0);
    buf_puts(out, text);
    return;
  }
  const bool hours = ms >= 3600000.0;
  const int h = (int)(ms / 3600000.0);
  const double after_hours = ms - (double)h * 3600000.0;
  const int m = (int)(after_hours / 60000.0);
  const double seconds = (after_hours - (double)m * 60000.0) / 1000.0;
  if (hours) {
    snprintf(text, sizeof text, "%d:%02d:%06.3f (h:mm:ss.mmm)", h, m, seconds);
  } else {
    snprintf(text, sizeof text, "%d:%06.3f (m:ss.mmm)", m, seconds);
  }
  buf_puts(out, text);
}

jsrt_value jsrt_console_time(jsrt_value label) {
  TimerEntry *entry = timer_entry(count_label(label), true);
  /* Node warns and KEEPS the original start when a label is timed twice, so a re-`time` on a
   * running label must not restart it. */
  if (!entry->running) {
    entry->started_ms = monotonic_ms();
    entry->running = true;
  }
  return JSRT_UNDEFINED;
}

jsrt_value jsrt_console_time_end(jsrt_value label) {
  const double now = monotonic_ms();
  const char *name = count_label(label);
  TimerEntry *entry = timer_entry(name, false);
  /* A label that was never started warns in Node and prints no duration. Warning is a channel this
   * runtime does not have (the `countReset` rule), so it prints nothing -- which is exactly what
   * Node writes to stdout for this case. */
  if (entry == NULL || !entry->running) {
    return JSRT_UNDEFINED;
  }
  entry->running = false;
  Buf out;
  buf_init(&out);
  buf_puts(&out, name);
  buf_puts(&out, ": ");
  format_time(&out, now - entry->started_ms);
  buf_putc(&out, '\n');
  write_grouped(out.data, out.len, stdout);
  buf_free(&out);
  return JSRT_UNDEFINED;
}

/* console.trace: `Trace: <message>` on STDERR, or bare `Trace` without one. Node follows it with
 * stack frames; this runtime has no unwinder and does not fabricate any -- the same decision
 * `jsrt_uncaught` already made and for the same reason, that inventing frames would be worse than
 * omitting them. The observable contract kept here is the stream and the prefix. */
void jsrt_console_trace(jsrt_value message) {
  Buf out;
  buf_init(&out);
  buf_puts(&out, "Trace: ");
  inspect_scalar(&out, message, false);
  buf_putc(&out, '\n');
  write_grouped(out.data, out.len, stderr);
  buf_free(&out);
}

void jsrt_console_trace_bare(void) {
  Buf out;
  buf_init(&out);
  buf_puts(&out, "Trace\n");
  write_grouped(out.data, out.len, stderr);
  buf_free(&out);
}

/* console.assert: nothing at all when the condition holds, `Assertion failed` on STDERR when it
 * does not -- with `: message` appended only when a message was passed. */
/* Node's two separators: a STRING message joins with ": ", anything else with a space and its
 * inspect form -- `Assertion failed: why` against `Assertion failed 42`. An explicitly passed
 * `undefined` is "anything else", which is why the message-less form is its own entry point
 * instead of a JSRT_UNDEFINED sentinel here. */
static void assert_failed(jsrt_value message, bool has_message) {
  Buf out;
  buf_init(&out);
  buf_puts(&out, "Assertion failed");
  if (has_message) {
    if (jsrt_is(message, JSRT_TAG_STRING)) {
      buf_puts(&out, ": ");
      append_string(&out, (const JSString *)jsrt_ptr(message));
    } else {
      buf_putc(&out, ' ');
      inspect_scalar(&out, message, true);
    }
  }
  buf_putc(&out, '\n');
  write_grouped(out.data, out.len, stderr);
  buf_free(&out);
}

void jsrt_console_assert(jsrt_value condition, jsrt_value message) {
  if (!jsrt_truthy(condition)) {
    assert_failed(message, true);
  }
}

void jsrt_console_assert_bare(jsrt_value condition) {
  if (!jsrt_truthy(condition)) {
    assert_failed(JSRT_UNDEFINED, false);
  }
}

/* ============================================================================
 * console.table
 * ============================================================================
 *
 * The layout Node draws (WHATWG console "table", as Node implements it in `lib/internal/cli_table`)
 * is a box-drawn grid: a leading `(index)` column, one column per key seen across the rows, and a
 * trailing `Values` column for rows that are not objects. Every cell is one space, the content
 * left-aligned, then padding to the column's width, then one more space -- so a divider segment is
 * always the column width plus two.
 *
 * Cells are rendered with `inspect_value`, which is why a string cell is QUOTED (`'x'`) while the
 * index label is not: the label is a key, not a value. Missing keys leave the cell empty rather
 * than printing `undefined`, and a row that is not an object contributes to `Values` instead of to
 * any key column.
 *
 * Deferred by name: the Map/Set form, which Node draws with an `(iteration index)` column and, for
 * a Map, a separate `Key` column -- a different table, not a wider one. The gate refuses it
 * (`STA1214`) rather than this drawing something Node does not. */

/* A growable list of owned strings -- column names, and one row's rendered cells. */
typedef struct {
  char **items;
  size_t len;
  size_t cap;
} StrVec;

static void sv_init(StrVec *v) {
  v->items = NULL;
  v->len = 0;
  v->cap = 0;
}

static void sv_push(StrVec *v, char *owned) {
  if (v->len == v->cap) {
    v->cap = v->cap == 0 ? 8 : v->cap * 2;
    char **grown = (char **)realloc(v->items, v->cap * sizeof(char *));
    if (grown == NULL) {
      jsrt_panic("out of memory building a console.table");
    }
    v->items = grown;
  }
  v->items[v->len++] = owned;
}

static void sv_free(StrVec *v) {
  for (size_t i = 0; i < v->len; i++) {
    free(v->items[i]);
  }
  free(v->items);
}

static size_t sv_find(const StrVec *v, const char *name) {
  for (size_t i = 0; i < v->len; i++) {
    if (strcmp(v->items[i], name) == 0) {
      return i;
    }
  }
  return SIZE_MAX;
}

/* A NUL-terminated copy of a buffer's contents, and the buffer released. */
static char *buf_take(Buf *b) {
  buf_putc(b, '\0');
  return b->data;
}

/* One value rendered the way a table CELL renders it: inspect form, strings quoted. */
static char *cell_of(jsrt_value v) {
  Buf b;
  buf_init(&b);
  inspect_value(&b, v, 1, 0);
  return buf_take(&b);
}

/* Node pads by DISPLAY width, not byte count: a column holding `'日本'` is as wide as one holding
 * six ASCII characters. Continuation bytes never count, combining marks count zero, and the
 * East-Asian Wide and Fullwidth blocks count two -- which is `getStringWidth`'s rule for every
 * code point a table cell in this subset can hold. The full Unicode width table it consults for
 * the rarer blocks is not reproduced here: a cell containing one would be padded one column
 * narrow, which misaligns the row rather than corrupting it. */
static size_t cell_width(const char *s) {
  size_t width = 0;
  for (const unsigned char *p = (const unsigned char *)s; *p != '\0'; p++) {
    if ((*p & 0xC0) == 0x80) {
      continue; /* a continuation byte is part of the code point already counted */
    }
    uint32_t cp = *p;
    if (cp >= 0xF0) {
      cp = ((cp & 0x07u) << 18) | ((uint32_t)(p[1] & 0x3F) << 12) | ((uint32_t)(p[2] & 0x3F) << 6) |
           (uint32_t)(p[3] & 0x3F);
    } else if (cp >= 0xE0) {
      cp = ((cp & 0x0Fu) << 12) | ((uint32_t)(p[1] & 0x3F) << 6) | (uint32_t)(p[2] & 0x3F);
    } else if (cp >= 0xC0) {
      cp = ((cp & 0x1Fu) << 6) | (uint32_t)(p[1] & 0x3F);
    }
    const bool combining = (cp >= 0x0300 && cp <= 0x036F) || (cp >= 0x200B && cp <= 0x200F) ||
                           (cp >= 0xFE00 && cp <= 0xFE0F);
    const bool wide = (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) ||
                      (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) ||
                      (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF00 && cp <= 0xFF60) ||
                      (cp >= 0xFFE0 && cp <= 0xFFE6) || (cp >= 0x1F300 && cp <= 0x1F64F) ||
                      (cp >= 0x20000 && cp <= 0x3FFFD);
    width += combining ? 0 : (wide ? 2 : 1);
  }
  return width;
}

/* Whether a row's value contributes KEY COLUMNS (an object or an array) rather than a `Values`
 * cell. Maps, sets, regexps and promises are values here, not rows: `console.table([/a/])` puts
 * `/a/` under `Values`, which is what Node does with anything whose own properties it will not
 * enumerate. */
static bool tabular_row(jsrt_value v) {
  return (jsrt_is(v, JSRT_TAG_ARRAY) || jsrt_is(v, JSRT_TAG_OBJECT)) && !jsrt_is_map_or_set(v) &&
         !jsrt_is_regexp(v) && !jsrt_is_promise(v) && !jsrt_is_date(v);
}

/* `n` copies of `s`, for the horizontal rules. The existing `buf_repeat` takes a CHAR, and a box
 * rule is drawn with U+2500, which is three bytes. */
static void buf_repeat_utf8(Buf *b, const char *s, size_t n) {
  for (size_t i = 0; i < n; i++) {
    buf_puts(b, s);
  }
}

/* One cell: a space, the content, padding to `width`, a space. */
static void buf_cell(Buf *b, const char *text, size_t width) {
  buf_putc(b, ' ');
  buf_puts(b, text);
  for (size_t pad = cell_width(text); pad < width; pad++) {
    buf_putc(b, ' ');
  }
  buf_putc(b, ' ');
}

static void buf_rule(Buf *b, const char *left, const char *mid, const char *right,
                     const size_t *widths, size_t count) {
  buf_puts(b, left);
  for (size_t c = 0; c < count; c++) {
    buf_repeat_utf8(b, "─", widths[c] + 2);
    buf_puts(b, c + 1 == count ? right : mid);
  }
  buf_putc(b, '\n');
}

void jsrt_console_table(jsrt_value v) {
  /* Node falls back to console.log for anything that is not a collection of rows, and that
   * fallback is REACHABLE here: the gate accepts `console.table` on an Unknown receiver, so a
   * scalar can arrive at run time. */
  if (!tabular_row(v)) {
    jsrt_print(v);
    return;
  }

  /* Rows, as (index label, value). An array indexes by position; an object by its own keys, in
   * the enumeration order `Object.entries` already fixes for both layouts. */
  StrVec labels;
  sv_init(&labels);
  StrVec row_values; /* the `Values` cell, or an empty string when the row has key columns */
  sv_init(&row_values);
  StrVec columns;
  sv_init(&columns);
  /* cells[row * columns.len + col] once the column set is known -- built after the walk, because
   * a column discovered by the last row still needs an empty cell in the first. */
  StrVec keys_flat; /* every row's keys, run-length delimited by `key_counts` */
  sv_init(&keys_flat);
  StrVec vals_flat;
  sv_init(&vals_flat);
  size_t *key_counts = NULL;
  size_t row_count = 0;
  bool any_values = false;

  const bool from_array = jsrt_is(v, JSRT_TAG_ARRAY);
  const jsrt_value rows = from_array ? v : jsrt_object_entries(v);
  const JSRTArray *row_list = jsrt_as_array(rows);
  row_count = row_list->length;
  key_counts = (size_t *)calloc(row_count == 0 ? 1 : row_count, sizeof(size_t));
  if (key_counts == NULL) {
    jsrt_panic("out of memory building a console.table");
  }

  for (uint32_t i = 0; i < row_count; i++) {
    jsrt_value value;
    if (from_array) {
      Buf label;
      buf_init(&label);
      inspect_scalar(&label, jsrt_number((double)i), false);
      sv_push(&labels, buf_take(&label));
      value = row_list->elements[i];
    } else {
      const JSRTArray *pair = jsrt_as_array(row_list->elements[i]);
      Buf label;
      buf_init(&label);
      inspect_scalar(&label, pair->elements[0], false); /* a key prints unquoted */
      sv_push(&labels, buf_take(&label));
      value = pair->elements[1];
    }

    if (!tabular_row(value)) {
      sv_push(&row_values, cell_of(value));
      any_values = true;
      continue;
    }
    sv_push(&row_values, strdup(""));
    /* An ARRAY row's keys are its indices, which is why `[[1,2]]` tables as columns `0` and `1`. */
    if (jsrt_is(value, JSRT_TAG_ARRAY)) {
      const JSRTArray *inner = jsrt_as_array(value);
      for (uint32_t k = 0; k < inner->length; k++) {
        Buf name;
        buf_init(&name);
        inspect_scalar(&name, jsrt_number((double)k), false);
        sv_push(&keys_flat, buf_take(&name));
        sv_push(&vals_flat, cell_of(inner->elements[k]));
        key_counts[i]++;
      }
      continue;
    }
    const JSRTArray *entries = jsrt_as_array(jsrt_object_entries(value));
    for (uint32_t k = 0; k < entries->length; k++) {
      const JSRTArray *pair = jsrt_as_array(entries->elements[k]);
      Buf name;
      buf_init(&name);
      inspect_scalar(&name, pair->elements[0], false);
      sv_push(&keys_flat, buf_take(&name));
      sv_push(&vals_flat, cell_of(pair->elements[1]));
      key_counts[i]++;
    }
  }

  /* Column order is FIRST-SEEN across rows, with `Values` last if any row needed it. */
  for (size_t k = 0; k < keys_flat.len; k++) {
    if (sv_find(&columns, keys_flat.items[k]) == SIZE_MAX) {
      sv_push(&columns, strdup(keys_flat.items[k]));
    }
  }
  const size_t values_col = any_values ? columns.len : SIZE_MAX;
  if (any_values) {
    sv_push(&columns, strdup("Values"));
  }

  /* Widths: the index column plus one per data column, each the widest of its header and cells. */
  const size_t total = columns.len + 1;
  size_t *widths = (size_t *)calloc(total, sizeof(size_t));
  char **grid = (char **)calloc(row_count * columns.len + 1, sizeof(char *));
  if (widths == NULL || grid == NULL) {
    jsrt_panic("out of memory building a console.table");
  }
  widths[0] = cell_width("(index)");
  for (size_t c = 0; c < columns.len; c++) {
    widths[c + 1] = cell_width(columns.items[c]);
  }
  size_t flat = 0;
  for (size_t i = 0; i < row_count; i++) {
    widths[0] = widths[0] > cell_width(labels.items[i]) ? widths[0] : cell_width(labels.items[i]);
    for (size_t k = 0; k < key_counts[i]; k++, flat++) {
      const size_t c = sv_find(&columns, keys_flat.items[flat]);
      grid[i * columns.len + c] = vals_flat.items[flat];
    }
    if (values_col != SIZE_MAX && row_values.items[i][0] != '\0') {
      grid[i * columns.len + values_col] = row_values.items[i];
    }
    for (size_t c = 0; c < columns.len; c++) {
      const char *cell = grid[i * columns.len + c];
      const size_t w = cell == NULL ? 0 : cell_width(cell);
      widths[c + 1] = widths[c + 1] > w ? widths[c + 1] : w;
    }
  }

  Buf out;
  buf_init(&out);
  buf_rule(&out, "┌", "┬", "┐", widths, total);
  buf_puts(&out, "│");
  buf_cell(&out, "(index)", widths[0]);
  for (size_t c = 0; c < columns.len; c++) {
    buf_puts(&out, "│");
    buf_cell(&out, columns.items[c], widths[c + 1]);
  }
  buf_puts(&out, "│\n");
  buf_rule(&out, "├", "┼", "┤", widths, total);
  for (size_t i = 0; i < row_count; i++) {
    buf_puts(&out, "│");
    buf_cell(&out, labels.items[i], widths[0]);
    for (size_t c = 0; c < columns.len; c++) {
      const char *cell = grid[i * columns.len + c];
      buf_puts(&out, "│");
      buf_cell(&out, cell == NULL ? "" : cell, widths[c + 1]);
    }
    buf_puts(&out, "│\n");
  }
  buf_rule(&out, "└", "┴", "┘", widths, total);
  write_grouped(out.data, out.len, stdout);

  buf_free(&out);
  free(grid);
  free(widths);
  free(key_counts);
  sv_free(&labels);
  sv_free(&row_values);
  sv_free(&columns);
  sv_free(&keys_flat);
  sv_free(&vals_flat);
}

_Noreturn void jsrt_uncaught(void) {
  /* Same inspect form console.log uses, so `throw {x: 1}` reads as `{ x: 1 }` -- but on STDERR,
   * because stdout is the program's output and an uncaught exception is not part of it. The text
   * intentionally does not chase Node's (which prints source excerpts and stack frames this
   * runtime does not have); the OBSERVABLE contract is stderr + exit 1. */
  Buf out;
  buf_init(&out);
  buf_puts(&out, "Uncaught ");
  inspect_value(&out, jsrt_take_exception(), 0, 0);
  buf_putc(&out, '\n');
  fwrite(out.data, 1, out.len, stderr);
  buf_free(&out);
  exit(1);
}

/* Array.prototype.join (§23.1.3.16), which is also Array#toString: `undefined` separator means
 * ",", and `null`/`undefined` ELEMENTS join as empty text, not as their names. Lives here rather
 * than with the other array builtins because joining IS stringification — it needs Buf and the
 * recursive ToString below. */
jsrt_value jsrt_array_join(jsrt_value array, jsrt_value separator) {
  const JSRTArray *a = jsrt_as_array(array);
  Buf joined;
  buf_init(&joined);
  for (uint32_t i = 0; i < a->length; i++) {
    if (i > 0) {
      if (jsrt_is(separator, JSRT_TAG_UNDEFINED)) {
        buf_putc(&joined, ',');
      } else {
        append_string(&joined, (const JSString *)jsrt_ptr(separator));
      }
    }
    const jsrt_value element = a->elements[i];
    if (jsrt_is(element, JSRT_TAG_NULL) || jsrt_is(element, JSRT_TAG_UNDEFINED)) {
      continue;
    }
    const jsrt_value text = jsrt_to_string(element);
    append_string(&joined, (const JSString *)jsrt_ptr(text));
  }
  const jsrt_value result = jsrt_string_from_utf8(joined.data == NULL ? "" : joined.data,
                                                  joined.len);
  buf_free(&joined);
  return result;
}

/* ============================================================================
 * JSON.stringify (§25.5.2) — SerializeJSONProperty over the value graph
 * ============================================================================
 *
 * Lives here for jsrt_array_join's reason: serialization IS stringification, and it needs Buf,
 * format_double and the UTF-16 walk. Two departures from the inspect code above are the whole
 * point: numbers hide the minus of `-0` ("0", where inspect shows "-0"), and strings are QUOTED
 * per §25.5.2.2 — `"` and `\\` escaped, controls as their short escapes or \u00XX, and a LONE
 * surrogate as \udXXX (well-formed JSON.stringify, ES2019), where the inspect walk substitutes
 * U+FFFD.
 *
 * Two spec behaviours cannot be produced yet and abort loudly instead (the STA2005 pattern):
 * a CYCLE (the spec throws TypeError, and builtins cannot throw), and `undefined` at the TOP
 * level (the spec returns undefined where this node's type promises a string; the gate refuses
 * argument types that admit it, so reaching it means an Unknown leaked). Inside a structure,
 * `undefined` and closures follow the spec: skipped in objects, `null` in arrays. */

typedef struct JSONAncestor {
  const void *ptr;
  const struct JSONAncestor *parent;
} JSONAncestor;

static bool json_unserializable(jsrt_value v) {
  return jsrt_is(v, JSRT_TAG_UNDEFINED) || jsrt_is(v, JSRT_TAG_CLOSURE);
}

static void json_quote(Buf *out, const JSString *str) {
  buf_putc(out, '"');
  for (uint32_t i = 0; i < str->length; i++) {
    uint32_t cp = str->data[i];
    if (cp >= 0xD800u && cp <= 0xDBFFu && i + 1 < str->length && str->data[i + 1] >= 0xDC00u &&
        str->data[i + 1] <= 0xDFFFu) {
      /* A paired surrogate passes through as its code point, encoded UTF-8 below. */
      cp = 0x10000u + ((cp - 0xD800u) << 10) + (str->data[i + 1] - 0xDC00u);
      i++;
    }
    if (cp == '"' || cp == '\\') {
      buf_putc(out, '\\');
      buf_putc(out, (char)cp);
    } else if (cp == '\b') {
      buf_puts(out, "\\b");
    } else if (cp == '\f') {
      buf_puts(out, "\\f");
    } else if (cp == '\n') {
      buf_puts(out, "\\n");
    } else if (cp == '\r') {
      buf_puts(out, "\\r");
    } else if (cp == '\t') {
      buf_puts(out, "\\t");
    } else if (cp < 0x20u || (cp >= 0xD800u && cp <= 0xDFFFu)) {
      /* Controls without a short escape, and LONE surrogates (well-formed JSON.stringify). */
      char esc[8];
      snprintf(esc, sizeof esc, "\\u%04x", cp);
      buf_puts(out, esc);
    } else if (cp < 0x80u) {
      buf_putc(out, (char)cp);
    } else if (cp < 0x800u) {
      buf_putc(out, (char)(0xC0u | (cp >> 6)));
      buf_putc(out, (char)(0x80u | (cp & 0x3Fu)));
    } else if (cp < 0x10000u) {
      buf_putc(out, (char)(0xE0u | (cp >> 12)));
      buf_putc(out, (char)(0x80u | ((cp >> 6) & 0x3Fu)));
      buf_putc(out, (char)(0x80u | (cp & 0x3Fu)));
    } else {
      buf_putc(out, (char)(0xF0u | (cp >> 18)));
      buf_putc(out, (char)(0x80u | ((cp >> 12) & 0x3Fu)));
      buf_putc(out, (char)(0x80u | ((cp >> 6) & 0x3Fu)));
      buf_putc(out, (char)(0x80u | (cp & 0x3Fu)));
    }
  }
  buf_putc(out, '"');
}

static void json_check_cycle(const void *ptr, const JSONAncestor *chain) {
  for (; chain != NULL; chain = chain->parent) {
    if (chain->ptr == ptr) {
      jsrt_panic("STA2005: JSON.stringify of a cyclic structure is not yet supported; the spec "
                 "throws TypeError, which builtins cannot raise yet");
    }
  }
}

static void json_value(Buf *out, jsrt_value v, const JSONAncestor *chain) {
  /* §25.5.2.2 step 2: SerializeJSONProperty calls the value's own `toJSON` before doing anything
   * else, and `Date.prototype.toJSON` is the only one the subset has. It answers a STRING, or
   * `null` for an Invalid Date -- which is why `JSON.stringify(new Date(NaN))` is "null" and not
   * an abort, unlike `toISOString`. Serializing the ANSWER, not the Date, is what keeps this one
   * arm from needing a cycle check or a shape walk. */
  if (jsrt_is_date(v)) {
    json_value(out, jsrt_date_to_json(v), chain);
    return;
  }
  if (jsrt_is(v, JSRT_TAG_NULL)) {
    buf_puts(out, "null");
    return;
  }
  if (jsrt_is(v, JSRT_TAG_BOOL)) {
    buf_puts(out, v == JSRT_TRUE ? "true" : "false");
    return;
  }
  if (jsrt_is_double(v)) {
    double d = jsrt_to_double(v);
    if (isnan(d) || isinf(d)) {
      buf_puts(out, "null"); /* §25.5.2.2: non-finite serializes as null */
      return;
    }
    char num[64];
    format_double(d, num, sizeof num, false); /* false: JSON spells -0 as "0" */
    buf_puts(out, num);
    return;
  }
  if (jsrt_is(v, JSRT_TAG_STRING)) {
    json_quote(out, (const JSString *)jsrt_ptr(v));
    return;
  }
  if (jsrt_is(v, JSRT_TAG_ARRAY)) {
    const JSRTArray *a = jsrt_as_array(v);
    json_check_cycle(a, chain);
    const JSONAncestor here = {a, chain};
    buf_putc(out, '[');
    for (uint32_t i = 0; i < a->length; i++) {
      if (i > 0) {
        buf_putc(out, ',');
      }
      /* An unserializable ELEMENT is null, not skipped -- indices must keep their meaning. */
      if (json_unserializable(a->elements[i])) {
        buf_puts(out, "null");
      } else {
        json_value(out, a->elements[i], &here);
      }
    }
    buf_putc(out, ']');
    return;
  }
  if (jsrt_is(v, JSRT_TAG_OBJECT)) {
    if (jsrt_is_map_or_set(v) || jsrt_is_regexp(v) || jsrt_is_promise(v)) {
      buf_puts(out, "{}"); /* no enumerable own properties, Node's own answer */
      return;
    }
    json_check_cycle(jsrt_ptr(v), chain);
    const JSONAncestor here = {jsrt_ptr(v), chain};
    /* The one enumeration walk the runtime has; the pairs array is transient and stack-reachable
     * while this frame lives, which is what the collector scans. */
    const JSRTArray *entries = jsrt_as_array(jsrt_object_entries(v));
    buf_putc(out, '{');
    bool first = true;
    for (uint32_t i = 0; i < entries->length; i++) {
      const JSRTArray *pair = jsrt_as_array(entries->elements[i]);
      if (json_unserializable(pair->elements[1])) {
        continue; /* an unserializable VALUE drops its key */
      }
      if (!first) {
        buf_putc(out, ',');
      }
      first = false;
      json_quote(out, (const JSString *)jsrt_ptr(pair->elements[0]));
      buf_putc(out, ':');
      json_value(out, pair->elements[1], &here);
    }
    buf_putc(out, '}');
    return;
  }
  jsrt_panic("STA2005: JSON.stringify of undefined at the top level is not yet supported; the "
             "spec returns undefined where this call's type promises a string");
}

jsrt_value jsrt_json_stringify(jsrt_value v) {
  Buf out;
  buf_init(&out);
  json_value(&out, v, NULL);
  const jsrt_value result = jsrt_string_from_utf8(out.data == NULL ? "" : out.data, out.len);
  buf_free(&out);
  return result;
}

jsrt_value jsrt_to_string(jsrt_value v) {
  char buf[64];

  /* Array.prototype.toString is join(","), which is a different algorithm from the inspect form
   * above and produces different text for the same array: `String([1,[2,3]])` is "1,2,3" where
   * console.log shows `[ 1, [ 2, 3 ] ]`. `null` and `undefined` join as empty, not as their
   * names -- ECMA-262 §23.1.3.18.
   *
   * KNOWN CEILING: no cycle guard. ECMA-262 has join() return "" for an array reachable from
   * itself; this would recurse until the stack ran out. Building the cycle needs `a[0] = a`, which
   * the checker rejects for every array type the ts subset can spell, so the case is unreachable
   * until js mode's dynamic arrays land -- and the guard belongs there, with the seen-set that
   * inspect will need at the same time. (inspect_array is already safe: its depth cap stops it.) */
  if (jsrt_is(v, JSRT_TAG_ARRAY)) {
    return jsrt_array_join(v, JSRT_UNDEFINED);
  }

  if (jsrt_is_double(v)) {
    format_double(jsrt_to_double(v), buf, sizeof buf, false);
  } else if (jsrt_is(v, JSRT_TAG_STRING)) {
    return v; /* already a string */
  } else if (jsrt_is(v, JSRT_TAG_BOOL)) {
    snprintf(buf, sizeof buf, "%s", jsrt_as_bool(v) ? "true" : "false");
  } else if (jsrt_is(v, JSRT_TAG_NULL)) {
    snprintf(buf, sizeof buf, "null");
  } else if (jsrt_is(v, JSRT_TAG_UNDEFINED)) {
    snprintf(buf, sizeof buf, "undefined");
  } else if (jsrt_is(v, JSRT_TAG_INT32)) {
    snprintf(buf, sizeof buf, "%d", jsrt_as_int32(v));
  } else if (jsrt_is(v, JSRT_TAG_CLOSURE)) {
    /* KNOWN CEILING: ToString of a function is its SOURCE TEXT in ECMA-262, which needs the
     * original span carried into the binary. Until then this is deliberately shaped like a
     * function rather than "[object Object]", and differs from Node. */
    snprintf(buf, sizeof buf, "function %s() { [native code] }", jsrt_as_closure(v)->name);
  } else if (jsrt_is_promise(v)) {
    snprintf(buf, sizeof buf, "[object Promise]");
  } else {
    snprintf(buf, sizeof buf, "[object Object]");
  }

  return jsrt_string_from_utf8(buf, strlen(buf));
}
