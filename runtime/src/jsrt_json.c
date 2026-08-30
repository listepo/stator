/* jsrt_json.c — JSON.parse (§25.5.1): recursive descent over the text's UTF-16 code units,
 * building runtime values directly. JSON objects become dynamic-shape objects — the same
 * representation untyped object literals use, so everything downstream (printing, dynamic
 * property sites, stringify) already knows them. JSON arrays become jsrt arrays; the leaves are
 * strings, numbers, true/false/null. The reviver form never reaches here (gate-refused).
 *
 * The spec throws SyntaxError on malformed text; builtins cannot raise yet, so every syntax
 * error aborts loudly with the STA2005 pattern. Two representational corners abort the same
 * way rather than answer wrongly: a property key containing U+0000 (shape keys are C strings)
 * and nesting past the depth cap (the parser would otherwise fault on C stack exhaustion,
 * which is a crash, not a diagnostic). */

#include "jsrt.h"
#include "jsrt_value.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Deep enough for any data a program plausibly parses, shallow enough that the C stack
 * survives it with room to spare. */
#define JSON_MAX_DEPTH 512

typedef struct {
  jsrt_value text;
  uint32_t pos;
  uint32_t len;
} Parser;

static _Noreturn void json_fail(const Parser *p, const char *what) {
  char msg[192];
  snprintf(msg, sizeof msg,
           "STA2005: JSON.parse: %s at position %u; the spec throws SyntaxError, which builtins "
           "cannot raise yet",
           what, p->pos);
  jsrt_panic(msg);
}

static uint16_t peek(const Parser *p) {
  return p->pos < p->len ? jsrt_string_char(p->text, p->pos) : 0;
}

static void skip_ws(Parser *p) {
  while (p->pos < p->len) {
    uint16_t c = jsrt_string_char(p->text, p->pos);
    if (c != 0x09 && c != 0x0A && c != 0x0D && c != 0x20) {
      return;
    }
    p->pos++;
  }
}

static void expect(Parser *p, uint16_t unit, const char *what) {
  if (peek(p) != unit) {
    json_fail(p, what);
  }
  p->pos++;
}

/* ------------------------------------------------------------------ strings */

/* Growable unit buffer for string contents; plain malloc — it holds no jsrt_values, so the
 * collector never needs to see it, and it is freed before the parser returns. */
typedef struct {
  uint16_t *units;
  uint32_t len;
  uint32_t cap;
} UnitBuf;

static void units_push(UnitBuf *b, uint16_t unit) {
  if (b->len == b->cap) {
    b->cap = b->cap == 0 ? 16 : b->cap * 2;
    uint16_t *grown = (uint16_t *)realloc(b->units, (size_t)b->cap * sizeof(uint16_t));
    if (grown == NULL) {
      jsrt_panic("out of memory: JSON.parse string");
    }
    b->units = grown;
  }
  b->units[b->len++] = unit;
}

static uint16_t hex4(Parser *p) {
  uint16_t out = 0;
  for (int i = 0; i < 4; i++) {
    uint16_t c = peek(p);
    uint16_t digit;
    if (c >= '0' && c <= '9') {
      digit = c - '0';
    } else if (c >= 'a' && c <= 'f') {
      digit = c - 'a' + 10;
    } else if (c >= 'A' && c <= 'F') {
      digit = c - 'A' + 10;
    } else {
      json_fail(p, "a bad \\u escape");
    }
    out = (uint16_t)(out * 16 + digit);
    p->pos++;
  }
  return out;
}

/* The quoted-string production, contents decoded into `out` as UTF-16 units. Shared by string
 * values and object keys; the caller owns (and frees) the buffer. */
static void parse_string_units(Parser *p, UnitBuf *out) {
  expect(p, '"', "an unquoted string");
  for (;;) {
    if (p->pos >= p->len) {
      json_fail(p, "an unterminated string");
    }
    uint16_t c = jsrt_string_char(p->text, p->pos);
    if (c == '"') {
      p->pos++;
      return;
    }
    if (c < 0x20) {
      json_fail(p, "a control character in a string");
    }
    p->pos++;
    if (c != '\\') {
      units_push(out, c);
      continue;
    }
    uint16_t esc = peek(p);
    p->pos++;
    switch (esc) {
      case '"':
      case '\\':
      case '/':
        units_push(out, esc);
        break;
      case 'b':
        units_push(out, 0x08);
        break;
      case 'f':
        units_push(out, 0x0C);
        break;
      case 'n':
        units_push(out, 0x0A);
        break;
      case 'r':
        units_push(out, 0x0D);
        break;
      case 't':
        units_push(out, 0x09);
        break;
      case 'u':
        units_push(out, hex4(p));
        break;
      default:
        p->pos--;
        json_fail(p, "a bad escape in a string");
    }
  }
}

static jsrt_value parse_string(Parser *p) {
  UnitBuf buf = {NULL, 0, 0};
  parse_string_units(p, &buf);
  jsrt_value s = jsrt_string_from_units(buf.units, buf.len);
  free(buf.units);
  return s;
}

/* An object key is a shape key, and `jsrt_shape_key` is the one place that conversion lives --
 * it is the same immortal UTF-8 copy `Object.fromEntries` needs, and the shape table's own
 * lifetime rule. A key containing U+0000 aborts there, not here. */
static const char *parse_key(Parser *p) {
  return jsrt_shape_key(parse_string(p));
}

/* ------------------------------------------------------------------ numbers */

static bool is_digit(uint16_t c) { return c >= '0' && c <= '9'; }

/* One or more digits: the grammar's only repetition, required after a '.' and after an exponent
 * marker alike. A leading zero is NOT allowed to start a multi-digit integer part, which is why
 * that one place spells its own loop instead of calling this. */
static void require_digits(Parser *p) {
  if (!is_digit(peek(p))) {
    json_fail(p, "a bad number");
  }
  while (is_digit(peek(p))) {
    p->pos++;
  }
}

static jsrt_value parse_number(Parser *p) {
  uint32_t start = p->pos;
  if (peek(p) == '-') {
    p->pos++;
  }
  if (peek(p) == '0') {
    p->pos++;
  } else if (peek(p) >= '1' && peek(p) <= '9') {
    while (is_digit(peek(p))) {
      p->pos++;
    }
  } else {
    json_fail(p, "a bad number");
  }
  if (peek(p) == '.') {
    p->pos++;
    require_digits(p);
  }
  if (peek(p) == 'e' || peek(p) == 'E') {
    p->pos++;
    if (peek(p) == '+' || peek(p) == '-') {
      p->pos++;
    }
    require_digits(p);
  }
  /* The grammar above admitted ASCII only, so the units copy 1:1 into a strtod buffer; strtod
   * in the C locale is correctly rounded on the supported toolchains, which is the same answer
   * V8 computes — golden tests hold byte-for-byte through Ryū on the way back out. */
  uint32_t n = p->pos - start;
  char *digits = (char *)malloc((size_t)n + 1);
  if (digits == NULL) {
    jsrt_panic("out of memory: JSON.parse number");
  }
  for (uint32_t i = 0; i < n; i++) {
    digits[i] = (char)jsrt_string_char(p->text, start + i);
  }
  digits[n] = '\0';
  double d = strtod(digits, NULL);
  free(digits);
  return jsrt_number(d);
}

/* ------------------------------------------------------------------- values */

static jsrt_value parse_value(Parser *p, uint32_t depth);

static jsrt_value parse_object(Parser *p, uint32_t depth) {
  p->pos++; /* consume '{' */
  jsrt_value obj = jsrt_dynobj_new();
  skip_ws(p);
  if (peek(p) == '}') {
    p->pos++;
    return obj;
  }
  for (;;) {
    skip_ws(p);
    const char *key = parse_key(p);
    skip_ws(p);
    expect(p, ':', "a missing ':' in an object");
    jsrt_value member = parse_value(p, depth);
    /* Duplicate keys: set_prop finds the live slot and overwrites — last one wins, per spec. */
    jsrt_set_prop(obj, key, member, NULL);
    skip_ws(p);
    if (peek(p) == ',') {
      p->pos++;
      continue;
    }
    expect(p, '}', "a missing '}' in an object");
    return obj;
  }
}

static jsrt_value parse_array(Parser *p, uint32_t depth) {
  p->pos++; /* consume '[' */
  jsrt_value arr = jsrt_array_new(0, NULL);
  skip_ws(p);
  if (peek(p) == ']') {
    p->pos++;
    return arr;
  }
  for (;;) {
    jsrt_value element = parse_value(p, depth);
    jsrt_array_push(arr, element);
    skip_ws(p);
    if (peek(p) == ',') {
      p->pos++;
      continue;
    }
    expect(p, ']', "a missing ']' in an array");
    return arr;
  }
}

static bool match_word(Parser *p, const char *word) {
  uint32_t at = p->pos;
  for (const char *c = word; *c != '\0'; c++, at++) {
    if (at >= p->len || jsrt_string_char(p->text, at) != (uint16_t)*c) {
      return false;
    }
  }
  p->pos = at;
  return true;
}

static jsrt_value parse_value(Parser *p, uint32_t depth) {
  if (depth >= JSON_MAX_DEPTH) {
    json_fail(p, "nesting deeper than the supported limit");
  }
  skip_ws(p);
  uint16_t c = peek(p);
  if (c == '{') {
    return parse_object(p, depth + 1);
  }
  if (c == '[') {
    return parse_array(p, depth + 1);
  }
  if (c == '"') {
    return parse_string(p);
  }
  if (c == '-' || (c >= '0' && c <= '9')) {
    return parse_number(p);
  }
  if (match_word(p, "true")) {
    return JSRT_TRUE;
  }
  if (match_word(p, "false")) {
    return JSRT_FALSE;
  }
  if (match_word(p, "null")) {
    return JSRT_NULL;
  }
  json_fail(p, p->pos >= p->len ? "an unexpected end of input" : "an unexpected token");
}

jsrt_value jsrt_json_parse(jsrt_value text) {
  /* The gate accepts an UNTYPED argument -- in js mode that is the norm -- so the string tag is
   * settled here. ToString of anything else is a conversion the parser does not perform, and
   * reading a non-string as text would be silently wrong for exactly the values that matter. */
  if (!jsrt_is(text, JSRT_TAG_STRING)) {
    jsrt_panic("STA2005: JSON.parse of a value that is not a string is not yet supported");
  }
  Parser p = {text, 0, jsrt_string_length(text)};
  jsrt_value v = parse_value(&p, 0);
  skip_ws(&p);
  if (p.pos != p.len) {
    json_fail(&p, "trailing characters after the value");
  }
  return v;
}
