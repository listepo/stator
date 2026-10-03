/* jsrt_string_methods.c — String.prototype read as a value from a string the compiler only knows
 * as Unknown (plan.md §11c T11.4, plan-notes 310).
 *
 * A typed receiver never comes here: the lowering gives `s.slice(1)` a `string-op` node that
 * calls the entry point directly. An Unknown receiver goes through `jsrt_get_prop` and then the
 * call protocol, and a string has no shape table, so `text.slice(1)` read `undefined` and the
 * call aborted STA2006 where Node runs. `jsrt_string_method` answers a closure bound to the
 * receiver through `jsrt_bound_method`, the closure `jsrt_array_method` answers too.
 */

#include "jsrt_value.h"

#include <stddef.h>
#include <string.h>

typedef jsrt_value (*StringMethod0)(jsrt_value s);
typedef jsrt_value (*StringMethod1)(jsrt_value s, jsrt_value a);
typedef jsrt_value (*StringMethod2)(jsrt_value s, jsrt_value a, jsrt_value b);

/* One row per landed `STRING_OPS` member (packages/compiler/src/hir/nodes.ts). The entry point
 * the row names fixes how many arguments the call passes, each omitted one read as `undefined`
 * (`jsrt_arg`); `length` is the method's own `length` from ECMA-262 §22.1.3, which counts only
 * the required parameters (`padStart.length` is 1). */
typedef struct {
  const char *name;
  uint32_t length;
  StringMethod0 fn0;
  StringMethod1 fn1;
  StringMethod2 fn2;
} StringMethodRow;

#define ROW0(name, length, fn) {name, length, fn, NULL, NULL}
#define ROW1(name, length, fn) {name, length, NULL, fn, NULL}
#define ROW2(name, length, fn) {name, length, NULL, NULL, fn}

static const StringMethodRow STRING_METHOD_TABLE[] = {
    ROW1("at", 1, jsrt_string_at),
    ROW1("charAt", 1, jsrt_string_char_at),
    ROW1("charCodeAt", 1, jsrt_string_char_code_at),
    ROW1("codePointAt", 1, jsrt_string_code_point_at),
    ROW1("concat", 1, NULL),
    ROW2("endsWith", 1, jsrt_string_ends_with),
    ROW2("includes", 1, jsrt_string_includes),
    ROW2("indexOf", 1, jsrt_string_index_of),
    ROW2("lastIndexOf", 1, jsrt_string_last_index_of),
    ROW2("localeCompare", 1, jsrt_string_locale_compare),
    ROW1("match", 1, jsrt_string_match),
    ROW1("matchAll", 1, jsrt_string_match_all),
    ROW1("normalize", 0, jsrt_string_normalize),
    ROW2("padEnd", 1, jsrt_string_pad_end),
    ROW2("padStart", 1, jsrt_string_pad_start),
    ROW1("repeat", 1, jsrt_string_repeat),
    ROW2("replace", 2, jsrt_string_replace),
    ROW2("replaceAll", 2, jsrt_string_replace_all),
    ROW1("search", 1, jsrt_string_search),
    ROW2("slice", 2, jsrt_string_slice),
    ROW1("split", 2, jsrt_string_split),
    ROW2("startsWith", 1, jsrt_string_starts_with),
    ROW2("substring", 2, jsrt_string_substring),
    ROW1("toLocaleLowerCase", 0, jsrt_string_to_locale_lower_case),
    ROW1("toLocaleUpperCase", 0, jsrt_string_to_locale_upper_case),
    ROW0("toLowerCase", 0, jsrt_string_to_lower_case),
    ROW0("toString", 0, jsrt_string_to_string),
    ROW0("toUpperCase", 0, jsrt_string_to_upper_case),
    ROW0("trim", 0, jsrt_string_trim),
    ROW0("trimEnd", 0, jsrt_string_trim_end),
    ROW0("trimStart", 0, jsrt_string_trim_start),
    ROW0("valueOf", 0, jsrt_string_value_of),
};

/* `concat` is variadic and runs ToString on each argument (§22.1.3.4); `jsrt_string_concat` is
 * the primitive over two strings, so the coercion is here, as the emitter does it for the op. An
 * entry point that throws (`repeat`, `padStart`, `padEnd`) leaves its exception pending, and the
 * caller's pending check after the call sees it. */
static jsrt_value string_method_call(uint32_t argc, const jsrt_value *argv, JSRTEnv *env) {
  const jsrt_value receiver = env->slots[0];
  const StringMethodRow *row = &STRING_METHOD_TABLE[(size_t)jsrt_to_number(env->slots[1])];
  if (row->fn0 != NULL) {
    return row->fn0(receiver);
  }
  if (row->fn1 != NULL) {
    return row->fn1(receiver, jsrt_arg(argc, argv, 0));
  }
  if (row->fn2 != NULL) {
    return row->fn2(receiver, jsrt_arg(argc, argv, 0), jsrt_arg(argc, argv, 1));
  }
  /* An argument's ToString may run the program's `toString`, which allocates and may throw: the
   * text so far stays rooted across it, and a throw stops the walk before a later one runs. */
  JSRT_FRAME(2);
  JSRT_LOCAL(0) = receiver;
  for (uint32_t i = 0; i < argc && !jsrt_pending(); i++) {
    JSRT_LOCAL(1) = jsrt_to_string(argv[i]);
    if (!jsrt_pending()) {
      JSRT_LOCAL(0) = jsrt_string_concat(JSRT_LOCAL(0), JSRT_LOCAL(1));
    }
  }
  const jsrt_value out = JSRT_LOCAL(0);
  JSRT_FRAME_POP();
  return out;
}

/* The table row named `key`, or -1 for a name String.prototype does not have here. */
static ptrdiff_t string_method_row(const char *key) {
  const size_t rows = sizeof STRING_METHOD_TABLE / sizeof STRING_METHOD_TABLE[0];
  for (size_t i = 0; i < rows; i++) {
    if (strcmp(STRING_METHOD_TABLE[i].name, key) == 0) {
      return (ptrdiff_t)i;
    }
  }
  return -1;
}

bool jsrt_string_method(jsrt_value string, const char *key, jsrt_value *out) {
  const ptrdiff_t row = jsrt_is(string, JSRT_TAG_STRING) ? string_method_row(key) : -1;
  if (row < 0) {
    return false;
  }
  const StringMethodRow *method = &STRING_METHOD_TABLE[row];
  *out = jsrt_bound_method(string, (uint32_t)row, string_method_call, method->length, method->name);
  return true;
}
