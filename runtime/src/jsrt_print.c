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

static void inspect_array(Buf *out, jsrt_value v, int recurse, size_t indent) {
  if (recurse > INSPECT_MAX_DEPTH) {
    buf_puts(out, "[Array]");
    return;
  }

  const JSRTArray *a = jsrt_as_array(v);
  const uint32_t length = a->length;
  const size_t shown = length > INSPECT_MAX_ARRAY ? INSPECT_MAX_ARRAY : length;
  const bool truncated = length > shown;
  const size_t count = shown + (truncated ? 1 : 0);

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

  /* Grouping is attempted first, because whether it fired decides the layout below: if it changed
   * the number of lines, the single-line form is not even considered. */
  Buf *rows = NULL;
  size_t row_count = 0;
  if (count > 6) {
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
static void inspect_object(Buf *out, jsrt_value v, int recurse, size_t indent) {
  const JSRTObject *o = jsrt_as_object(v);
  const JSRTClass *cls = o->cls;

  /* An object LITERAL has no constructor name, and Node prints none: `{ x: 1 }`, not `Object
   * { x: 1 }`. Its descriptor carries the empty name, which is unambiguous -- no class may be
   * called "" -- and every place the name would print becomes a place it does not. */
  const bool named = cls->name[0] != '\0';

  if (recurse > INSPECT_MAX_DEPTH) {
    /* `[Deep]`, not `[Object]`: past the cap Node still names the constructor it stopped at --
     * and for a literal, which has no constructor, that name IS `Object`. */
    buf_putc(out, '[');
    buf_puts(out, named ? cls->name : "Object");
    buf_putc(out, ']');
    return;
  }

  /* A `#private` field HAS a slot -- it is on the instance like any other field -- but
   * `util.inspect` does not show it, so neither does this. A leading '#' is the whole test, and it
   * is unambiguous: a class field's name is an identifier by construction, and no identifier can
   * start with one. Printing therefore walks the visible slots, not every slot. */
  size_t count = 0;
  for (uint32_t i = 0; i < cls->field_count; i++) {
    if (cls->fields[i][0] != '#') {
      count++;
    }
  }
  if (count == 0) {
    if (named) {
      buf_puts(out, cls->name);
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
  for (uint32_t slot = 0; slot < cls->field_count; slot++) {
    if (cls->fields[slot][0] == '#') {
      continue;
    }
    Buf *entry = &entries[next++];
    buf_init(entry);
    buf_puts(entry, cls->fields[slot]);
    buf_puts(entry, ": ");
    inspect_value(entry, o->fields[slot], recurse + 1, indent + 2);
  }

  /* The name and the space after it are part of the prefix Node measures, along with the `{`. A
   * literal contributes neither, so its budget is one character wider. */
  const size_t prefix = named ? strlen(cls->name) + 1 /* the space */ + 1 : 1 /* "{" */;
  if (named) {
    buf_puts(out, cls->name);
    buf_putc(out, ' ');
  }
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

static void inspect_value(Buf *out, jsrt_value v, int recurse, size_t indent) {
  if (jsrt_is_map_or_set(v)) {
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

void jsrt_print(jsrt_value v) {
  Buf out;
  buf_init(&out);

  /* The top level is not inside an array, so a string prints bare -- `console.log("a")` is `a`,
   * while `console.log(["a"])` is `[ 'a' ]`. */
  if (jsrt_is_map_or_set(v)) {
    inspect_map(&out, v, 0, 0);
  } else if (jsrt_is(v, JSRT_TAG_OBJECT)) {
    inspect_object(&out, v, 0, 0);
  } else if (jsrt_is(v, JSRT_TAG_ARRAY)) {
    inspect_array(&out, v, 0, 0);
  } else {
    inspect_scalar(&out, v, false);
  }

  buf_putc(&out, '\n');
  fwrite(out.data, 1, out.len, stdout);
  buf_free(&out);
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
    const JSRTArray *a = jsrt_as_array(v);
    Buf joined;
    buf_init(&joined);
    for (uint32_t i = 0; i < a->length; i++) {
      if (i > 0) {
        buf_putc(&joined, ',');
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
  } else {
    snprintf(buf, sizeof buf, "[object Object]");
  }

  return jsrt_string_from_utf8(buf, strlen(buf));
}
