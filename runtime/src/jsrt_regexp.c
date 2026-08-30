/* jsrt_regexp.c — the bridge between Stator's values and quickjs-ng's libregexp.
 *
 * The engine is vendored, not written (plan.md golden rule 5): `runtime/vendor/quickjs-ng`, see
 * its VENDOR.md. It asks its embedder for exactly three functions — an allocator, a stack-depth
 * question and a timeout question — and everything else here is translation: a pattern from our
 * UTF-16 strings into the UTF-8 the compiler reads, and a subject string straight into the
 * executor, which takes UTF-16 code units natively and therefore needs no copy at all.
 *
 * What the engine does NOT get is a notion of our values: `lre_exec` writes byte pointers into a
 * capture array, and turning those into indices, strings or arrays is this file's job. */

#include "jsrt.h"
#include "jsrt_value.h"

#include "libregexp.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const JSRTClass jsrt_class_regexp = {"RegExp", 0, NULL, NULL, 0, NULL};

/* ============================================================================
 * The three functions libregexp.h says "must be provided by the user"
 * ============================================================================ */

/* The engine's only allocator. Its convention is realloc's, with size 0 meaning free.
 *
 * Deliberately NOT the collected heap even when Boehm is present: this memory holds bytecode and
 * scratch buffers, never a `jsrt_value`, so nothing in it needs scanning — and the collector would
 * have to scan it, because it cannot know that. The regexp object owns the bytecode for as long as
 * it lives, and a regexp that dies takes the allocation with it only once the collector can run
 * finalizers; until then this is the same leak every other malloc'd table in the runtime has. */
void *lre_realloc(void *opaque, void *ptr, size_t size) {
  (void)opaque;
  if (size == 0) {
    free(ptr);
    return NULL;
  }
  void *grown = realloc(ptr, size);
  if (grown == NULL) {
    jsrt_panic("out of memory: regexp engine");
  }
  return grown;
}

/* The engine recurses — while compiling a nested pattern and while backtracking — and asks before
 * each step whether the C stack can take another frame. Answering "never overflowing" would turn a
 * pathological pattern into a segfault, so this measures instead: the first call records an address
 * on the stack and every call after it compares the current depth against a budget that sits well
 * inside the smallest stack this runtime plausibly runs on (512 KB is a typical non-main pthread
 * default; the main thread has 8 MB on macOS). The runtime is single-threaded, so a plain static
 * is the right amount of machinery for the base. */
#define LRE_STACK_BUDGET ((size_t)192 * 1024)

static const char *lre_stack_base;

bool lre_check_stack_overflow(void *opaque, size_t alloca_size) {
  (void)opaque;
  const char here = 0;
  if (lre_stack_base == NULL) {
    lre_stack_base = &here;
  }
  /* Stacks grow down on every target Stator supports; a negative depth would mean this call is
   * SHALLOWER than the first one, which is not an overflow. */
  const ptrdiff_t used = lre_stack_base - &here;
  return used > 0 && (size_t)used + alloca_size > LRE_STACK_BUDGET;
}

/* No interruption: a compiled program has no watchdog to ask, and a regexp that runs forever is a
 * program that runs forever, which is a thing JavaScript lets you write. */
int lre_check_timeout(void *opaque) {
  (void)opaque;
  return 0;
}

/* ============================================================================
 * Patterns
 * ============================================================================ */

/* The compiler reads the pattern as UTF-8 — or as CESU-8 when the pattern is not a unicode one,
 * which is the same rule quickjs applies: a LONE surrogate has no UTF-8 encoding, and a
 * non-unicode pattern may legally contain one, so there each UTF-16 unit is encoded on its own.
 * The result is NUL-terminated for convenience; the length is what the engine is given, because a
 * pattern may legitimately contain U+0000. */
static char *pattern_utf8(jsrt_value source, bool unicode, size_t *out_len) {
  const JSString *str = (const JSString *)jsrt_ptr(source);
  /* Four bytes per unit is the worst case for both encodings, and a surrogate PAIR only ever
   * shrinks against it (two units, four bytes). */
  char *out = (char *)malloc((size_t)str->length * 4 + 1);
  if (out == NULL) {
    jsrt_panic("out of memory: regexp pattern");
  }
  size_t n = 0;
  for (uint32_t i = 0; i < str->length; i++) {
    uint32_t cp = str->data[i];
    if (unicode && cp >= 0xD800u && cp <= 0xDBFFu && i + 1 < str->length &&
        str->data[i + 1] >= 0xDC00u && str->data[i + 1] <= 0xDFFFu) {
      cp = 0x10000u + ((cp - 0xD800u) << 10) + (str->data[i + 1] - 0xDC00u);
      i++;
    }
    if (cp < 0x80u) {
      out[n++] = (char)cp;
    } else if (cp < 0x800u) {
      out[n++] = (char)(0xC0u | (cp >> 6));
      out[n++] = (char)(0x80u | (cp & 0x3Fu));
    } else if (cp < 0x10000u) {
      out[n++] = (char)(0xE0u | (cp >> 12));
      out[n++] = (char)(0x80u | ((cp >> 6) & 0x3Fu));
      out[n++] = (char)(0x80u | (cp & 0x3Fu));
    } else {
      out[n++] = (char)(0xF0u | (cp >> 18));
      out[n++] = (char)(0x80u | ((cp >> 12) & 0x3Fu));
      out[n++] = (char)(0x80u | ((cp >> 6) & 0x3Fu));
      out[n++] = (char)(0x80u | (cp & 0x3Fu));
    }
  }
  out[n] = '\0';
  *out_len = n;
  return out;
}

/* The flag string, in any order, as the LRE_FLAG_* set. A flag the engine does not know, or one
 * written twice, is a SyntaxError in the spec; builtins cannot raise yet, so it aborts loudly with
 * the STA2005 pattern rather than compiling a pattern the program did not write. */
static int flags_to_lre(jsrt_value flags) {
  const JSString *str = (const JSString *)jsrt_ptr(flags);
  int out = 0;
  for (uint32_t i = 0; i < str->length; i++) {
    int bit;
    switch (str->data[i]) {
      case 'd': bit = LRE_FLAG_INDICES; break;
      case 'g': bit = LRE_FLAG_GLOBAL; break;
      case 'i': bit = LRE_FLAG_IGNORECASE; break;
      case 'm': bit = LRE_FLAG_MULTILINE; break;
      case 's': bit = LRE_FLAG_DOTALL; break;
      case 'u': bit = LRE_FLAG_UNICODE; break;
      case 'v': bit = LRE_FLAG_UNICODE_SETS; break;
      case 'y': bit = LRE_FLAG_STICKY; break;
      default: {
        char msg[96];
        snprintf(msg, sizeof msg, "STA2005: invalid regular expression flag '%c'",
                 (char)str->data[i]);
        jsrt_panic(msg);
      }
    }
    if ((out & bit) != 0) {
      jsrt_panic("STA2005: a regular expression flag is written twice");
    }
    out |= bit;
  }
  if ((out & LRE_FLAG_UNICODE) != 0 && (out & LRE_FLAG_UNICODE_SETS) != 0) {
    jsrt_panic("STA2005: the regular expression flags 'u' and 'v' cannot be combined");
  }
  return out;
}

jsrt_value jsrt_regexp_new(jsrt_value source, jsrt_value flags) {
  const int lre_flags = flags_to_lre(flags);
  size_t pattern_len = 0;
  char *pattern =
      pattern_utf8(source, (lre_flags & (LRE_FLAG_UNICODE | LRE_FLAG_UNICODE_SETS)) != 0,
                   &pattern_len);

  char error[128];
  int bytecode_len = 0;
  uint8_t *bytecode =
      lre_compile(&bytecode_len, error, sizeof error, pattern, pattern_len, lre_flags, NULL);
  free(pattern);
  if (bytecode == NULL) {
    /* The spec throws SyntaxError here. Every spelling the subset accepts has its pattern in the
     * SOURCE, so this is a program that cannot work rather than data that happened to be bad. */
    char msg[224];
    snprintf(msg, sizeof msg,
             "STA2005: invalid regular expression: %s; the spec throws SyntaxError, which builtins "
             "cannot raise yet",
             error);
    jsrt_panic(msg);
  }

  JSRTRegExp *re = (JSRTRegExp *)jsrt_gc_alloc(sizeof(JSRTRegExp), "regexp");
  re->cls = &jsrt_class_regexp;
  /* §22.2.6.10: the `source` of an empty pattern is `(?:)`, not the empty string -- so that
   * `/source/flags` is always a spelling that parses back. Normalized once, here, because every
   * reader of `source` (printing today, the `.source` property later) wants the same answer. */
  re->source = jsrt_string_length(source) == 0 ? jsrt_string_from_utf8("(?:)", 4) : source;
  re->flags = flags;
  re->lre_flags = lre_flags;
  re->last_index = 0;
  re->bytecode = bytecode;
  re->bytecode_len = bytecode_len;
  return JSRT_BOX(JSRT_TAG_OBJECT, (uintptr_t)re);
}

/* ============================================================================
 * Matching
 * ============================================================================ */

/* One match attempt at `start`, with the capture array the caller owns.
 *
 * `capture` must hold `lre_get_alloc_count` pointers, NOT twice the capture count: the executor
 * spills its own registers into the same array, and sizing it by the group count overruns the heap
 * on any pattern that uses one (upstream says so in a comment, having fixed exactly that bug).
 *
 * The subject needs no conversion: our strings ARE UTF-16 code units, which is what `cbuf_type` 1
 * means to the engine. It promotes that to 2 (pair surrogates) by itself for a unicode pattern. */
static bool exec_at(const JSRTRegExp *re, const JSString *subject, uint32_t start,
                    uint8_t **capture) {
  if (start > subject->length) {
    return false;
  }
  const int rc = lre_exec(capture, re->bytecode, (const uint8_t *)subject->data, (int)start,
                          (int)subject->length, 1, NULL);
  if (rc < 0) {
    jsrt_panic(rc == LRE_RET_MEMORY_ERROR ? "out of memory: regexp match"
                                          : "STA2005: the regular expression engine gave up");
  }
  return rc == 1;
}

/* RegExp's empty-match advance is AdvanceStringIndex, not simply `index + 1`: a unicode pattern
 * must skip a surrogate pair as one code point.  Calling lre_exec at the low surrogate would make
 * the engine rewind to the pair's high surrogate and report the same empty match forever. */
static uint32_t advance_string_index(const JSString *s, uint32_t index, bool unicode) {
  if (unicode && index < s->length && s->length - index > 1) {
    const uint16_t first = s->data[index];
    const uint16_t second = s->data[index + 1];
    if (first >= 0xD800u && first <= 0xDBFFu && second >= 0xDC00u && second <= 0xDFFFu) {
      return index + 2;
    }
  }
  return index + 1;
}

/* The capture array the executor writes into, sized the way it demands. Freed by the caller. */
static uint8_t **capture_buffer(const JSRTRegExp *re) {
  const int count = lre_get_alloc_count(re->bytecode);
  if (count <= 0) {
    return NULL;
  }
  uint8_t **capture = (uint8_t **)malloc(sizeof(uint8_t *) * (size_t)count);
  if (capture == NULL) {
    jsrt_panic("out of memory: regexp captures");
  }
  return capture;
}

bool jsrt_regexp_test(jsrt_value re_value, jsrt_value str) {
  /* The gate accepts an UNTYPED subject -- in js mode that is the norm -- so the string tag is
   * settled here, jsrt_json_parse's rule: ToString of anything else is a conversion this bridge
   * does not perform, and reading a non-string as UTF-16 units would fault or answer nonsense. */
  if (!jsrt_is(str, JSRT_TAG_STRING)) {
    jsrt_panic("STA2005: RegExp.prototype.test of a value that is not a string is not yet supported");
  }
  JSRTRegExp *re = jsrt_as_regexp(re_value);
  const JSString *subject = (const JSString *)jsrt_ptr(str);
  /* `lastIndex` is read only by a /g or /y pattern, and written back by one whatever the outcome:
   * a failed match resets it to 0, which is what makes `while (re.test(s))` terminate. */
  const bool stateful = (re->lre_flags & (LRE_FLAG_GLOBAL | LRE_FLAG_STICKY)) != 0;
  const uint32_t start = stateful ? re->last_index : 0;

  uint8_t **capture = capture_buffer(re);
  const bool matched = exec_at(re, subject, start, capture);
  if (stateful) {
    re->last_index =
        matched && capture != NULL
            ? (uint32_t)((const uint16_t *)capture[1] - subject->data)
            : 0;
  }
  free(capture);
  return matched;
}

/* ============================================================================
 * Scanning — the one engine under search, split and replace
 * ============================================================================ */

/* A capture group that did not participate. Distinguishable from index 0, which is a real
 * position; the spec's own answer for one is `undefined`. */
#define NO_GROUP UINT32_MAX

/* Every match of a pattern in a subject, flattened: `ncap` groups per match with two offsets each,
 * group 0 being the whole match. Plain data -- no jsrt_value ever lands here -- so it is malloc'd
 * and a collector need never see it. */
typedef struct {
  uint32_t *bounds;
  uint32_t count;
  uint32_t cap;
  uint32_t ncap;
} Matches;

static const uint32_t *match_of(const Matches *m, uint32_t i) {
  return m->bounds + (size_t)i * 2 * (size_t)m->ncap;
}

static void matches_push(Matches *m, const JSString *s, uint8_t *const *capture) {
  if (m->count == m->cap) {
    m->cap = m->cap == 0 ? 8 : m->cap * 2;
    uint32_t *grown =
        (uint32_t *)realloc(m->bounds, (size_t)m->cap * 2 * (size_t)m->ncap * sizeof(uint32_t));
    if (grown == NULL) {
      jsrt_panic("out of memory: regexp matches");
    }
    m->bounds = grown;
  }
  uint32_t *slot = m->bounds + (size_t)m->count * 2 * (size_t)m->ncap;
  for (uint32_t g = 0; g < m->ncap; g++) {
    const uint16_t *begin = (const uint16_t *)capture[2 * g];
    const uint16_t *end = (const uint16_t *)capture[2 * g + 1];
    slot[2 * g] = begin == NULL ? NO_GROUP : (uint32_t)(begin - s->data);
    slot[2 * g + 1] = end == NULL ? NO_GROUP : (uint32_t)(end - s->data);
  }
  m->count++;
}

/* Left-to-right, non-overlapping matches from `from`, at most `limit` of them.
 *
 * An EMPTY match advances the scan by one code unit -- §22.2.5.8's AdvanceStringIndex -- which is
 * also the only thing that stops the scan from standing still. `walk` is the difference between
 * the two loops the spec actually writes: a failed attempt ends the scan for RegExpExec (a
 * forward search has already looked at every later position), but `@@split` retries at the next
 * position, because its splitter is STICKY and an attempt therefore only looked where it stood.
 * A user pattern that is already sticky needs the same retry for the same reason. */
static Matches scan(const JSRTRegExp *re, const JSString *s, uint32_t from, uint32_t limit,
                    bool walk) {
  const bool sticky = (re->lre_flags & LRE_FLAG_STICKY) != 0;
  const bool unicode = (re->lre_flags & (LRE_FLAG_UNICODE | LRE_FLAG_UNICODE_SETS)) != 0;
  Matches out = {NULL, 0, 0, (uint32_t)lre_get_capture_count(re->bytecode)};
  uint8_t **capture = capture_buffer(re);
  uint32_t at = from;
  while (out.count < limit && at <= s->length && capture != NULL) {
    if (!exec_at(re, s, at, capture)) {
      if (!(walk && sticky)) {
        break;
      }
      at = advance_string_index(s, at, unicode);
      continue;
    }
    matches_push(&out, s, capture);
    const uint32_t *m = match_of(&out, out.count - 1);
    at = m[1] > m[0] ? m[1] : advance_string_index(s, m[0], unicode);
  }
  free(capture);
  return out;
}

static void matches_free(Matches *m) { free(m->bounds); }

/* The gate accepts an UNTYPED subject -- in js mode that is the norm -- so the string tag is
 * settled here, jsrt_json_parse's rule: ToString of anything else is a conversion this bridge does
 * not perform, and reading a non-string as UTF-16 units would fault or answer nonsense. */
static const JSString *subject_of(jsrt_value str, const char *method) {
  if (!jsrt_is(str, JSRT_TAG_STRING)) {
    char msg[128];
    snprintf(msg, sizeof msg,
             "STA2005: String.prototype.%s of a value that is not a string is not yet supported",
             method);
    jsrt_panic(msg);
  }
  return (const JSString *)jsrt_ptr(str);
}

/* ============================================================================
 * The regexp-taking String.prototype methods (§22.2.5)
 * ============================================================================ */

jsrt_value jsrt_regexp_search(jsrt_value re_value, jsrt_value str) {
  const JSString *s = subject_of(str, "search");
  JSRTRegExp *re = jsrt_as_regexp(re_value);
  /* §22.2.5.9: `lastIndex` is saved, forced to 0 for the attempt, and put back. `search` answers a
   * position, never a cursor -- so unlike `test`, it leaves no state behind. */
  const uint32_t saved = re->last_index;
  re->last_index = 0;
  uint8_t **capture = capture_buffer(re);
  const bool hit = capture != NULL && exec_at(re, s, 0, capture);
  const double at = hit ? (double)((const uint16_t *)capture[0] - s->data) : -1;
  free(capture);
  re->last_index = saved;
  return jsrt_number(at);
}

/* One capture group as a value: the substring it covers, or `undefined` where it did not
 * participate -- which is what `'ab'.split(/(x)?b/)` puts in the middle of its answer. */
static jsrt_value group_value(const JSString *s, const uint32_t *m, uint32_t g) {
  return m[2 * g] == NO_GROUP ? JSRT_UNDEFINED
                              : jsrt_string_from_units(s->data + m[2 * g], m[2 * g + 1] - m[2 * g]);
}

jsrt_value jsrt_regexp_split(jsrt_value re_value, jsrt_value str) {
  const JSString *s = subject_of(str, "split");
  const JSRTRegExp *re = jsrt_as_regexp(re_value);
  jsrt_value out = jsrt_array_new(0, NULL);

  /* §22.2.5.14 step 14: the empty subject answers [] when the pattern matches it and [""] when it
   * does not. It is the one asymmetry in the algorithm, and it falls out of nothing below. */
  if (s->length == 0) {
    Matches probe = scan(re, s, 0, 1, true);
    if (probe.count == 0) {
      jsrt_array_push(out, str);
    }
    matches_free(&probe);
    return out;
  }

  Matches m = scan(re, s, 0, UINT32_MAX, true);
  uint32_t p = 0;
  for (uint32_t i = 0; i < m.count; i++) {
    const uint32_t *g = match_of(&m, i);
    /* The spec's loop is `while q < size`, so a match starting AT the end is never attempted --
     * which is the whole reason `'abc'.split(/(?:)/)` is three elements and not four. The scan
     * finds it because a match at the end is a real match; split alone must not see it. */
    if (g[0] >= s->length) {
      break;
    }
    /* A match ending exactly where the last segment ended contributes nothing: the spec steps past
     * it rather than emitting an empty piece, which is what keeps a pattern that can match the
     * empty string from filling the answer with empty strings. */
    if (g[1] == p) {
      continue;
    }
    jsrt_array_push(out, jsrt_string_from_units(s->data + p, g[0] - p));
    /* Capture groups are part of the ANSWER here, not just of the match: `'a1b'.split(/(\d)/)`
     * is ['a', '1', 'b']. */
    for (uint32_t k = 1; k < m.ncap; k++) {
      jsrt_array_push(out, group_value(s, g, k));
    }
    p = g[1];
  }
  matches_free(&m);
  jsrt_array_push(out, jsrt_string_from_units(s->data + p, s->length - p));
  return out;
}

/* ---------------------------------------------------------------- replace */

/* A growable UTF-16 buffer for the replacement's output. Plain malloc: it holds no jsrt_value, so
 * the collector never needs to see it, and it is freed before the result string is boxed. */
typedef struct {
  uint16_t *units;
  uint32_t len;
  uint32_t cap;
} Out;

static void out_units(Out *o, const uint16_t *src, uint32_t n) {
  if (o->len + n > o->cap) {
    uint32_t want = o->cap == 0 ? 32 : o->cap;
    while (want < o->len + n) {
      want *= 2;
    }
    uint16_t *grown = (uint16_t *)realloc(o->units, (size_t)want * sizeof(uint16_t));
    if (grown == NULL) {
      jsrt_panic("out of memory: regexp replace");
    }
    o->units = grown;
    o->cap = want;
  }
  memcpy(o->units + o->len, src, (size_t)n * sizeof(uint16_t));
  o->len += n;
}

/* §22.1.3.19 GetSubstitution over ONE match. `$$` `$&` `` $` `` `$'` are the string forms the
 * plain-pattern replace already implements; `$n`/`$nn` are the ones only a pattern with groups
 * can answer, and a number above the group count stays LITERAL, which is what makes `$1` in a
 * groupless pattern print as `$1`. */
static void substitute(Out *o, const JSString *rep, const JSString *s, const Matches *m,
                       const uint32_t *g) {
  for (uint32_t k = 0; k < rep->length; k++) {
    if (rep->data[k] != '$' || k + 1 >= rep->length) {
      out_units(o, rep->data + k, 1);
      continue;
    }
    const uint16_t next = rep->data[k + 1];
    if (next == '$') {
      out_units(o, rep->data + k, 1);
      k++;
    } else if (next == '&') {
      out_units(o, s->data + g[0], g[1] - g[0]);
      k++;
    } else if (next == '`') {
      out_units(o, s->data, g[0]);
      k++;
    } else if (next == '\'') {
      out_units(o, s->data + g[1], s->length - g[1]);
      k++;
    } else if (next >= '0' && next <= '9') {
      /* Two digits win over one where both name a real group -- `$12` is group 12 when the
       * pattern has twelve, and group 1 followed by a '2' when it does not. */
      uint32_t group = (uint32_t)(next - '0');
      uint32_t width = 1;
      if (k + 2 < rep->length && rep->data[k + 2] >= '0' && rep->data[k + 2] <= '9') {
        const uint32_t two = group * 10 + (uint32_t)(rep->data[k + 2] - '0');
        if (two > 0 && two < m->ncap) {
          group = two;
          width = 2;
        }
      }
      if (group == 0 || group >= m->ncap) {
        out_units(o, rep->data + k, 1);
        continue;
      }
      if (g[2 * group] != NO_GROUP) {
        out_units(o, s->data + g[2 * group], g[2 * group + 1] - g[2 * group]);
      }
      k += width;
    } else {
      out_units(o, rep->data + k, 1);
    }
  }
}

jsrt_value jsrt_regexp_replace(jsrt_value re_value, jsrt_value str, jsrt_value replacement,
                               bool all) {
  const JSString *s = subject_of(str, all ? "replaceAll" : "replace");
  JSRTRegExp *re = jsrt_as_regexp(re_value);
  const JSString *rep = subject_of(replacement, all ? "replaceAll" : "replace");
  const bool global = (re->lre_flags & LRE_FLAG_GLOBAL) != 0;
  const bool sticky = (re->lre_flags & LRE_FLAG_STICKY) != 0;

  /* §22.1.3.20 step 2: replaceAll demands a /g pattern. The spec throws TypeError; builtins cannot
   * raise yet, so this aborts loudly rather than quietly behaving like `replace`. */
  if (all && !global) {
    jsrt_panic("STA2005: replaceAll with a non-global regular expression; the spec throws "
               "TypeError, which builtins cannot raise yet");
  }
  /* §22.2.5.11 step 6: a global pattern restarts at 0 and ends at 0. A non-global one reads and
   * writes `lastIndex` only when it is sticky -- that is RegExpBuiltinExec's rule, not @@replace's,
   * which is why a plain /re/ ignores the cursor entirely. */
  if (global) {
    re->last_index = 0;
  }
  const uint32_t from = (global || sticky) ? re->last_index : 0;
  Matches m = scan(re, s, from, global ? UINT32_MAX : 1, false);
  if (global) {
    re->last_index = 0;
  } else if (sticky) {
    re->last_index = m.count > 0 ? match_of(&m, 0)[1] : 0;
  }

  if (m.count == 0) {
    matches_free(&m);
    return str;
  }
  Out o = {NULL, 0, 0};
  uint32_t tail = 0;
  for (uint32_t i = 0; i < m.count; i++) {
    const uint32_t *g = match_of(&m, i);
    out_units(&o, s->data + tail, g[0] - tail);
    substitute(&o, rep, s, &m, g);
    tail = g[1];
  }
  out_units(&o, s->data + tail, s->length - tail);
  matches_free(&m);
  jsrt_value result = jsrt_string_from_units(o.units, o.len);
  free(o.units);
  return result;
}
