/* jsrt_intl.c -- the locale-sensitive String.prototype methods (plan.md Task 4.4).
 *
 * `localeCompare`, `toLocaleUpperCase` and `toLocaleLowerCase` are the three members of the
 * landed string surface that Unicode's own tables cannot answer. Collation is a per-locale
 * ORDER, not a code-point order ('a' < 'ä' < 'z' in German, but 'ä' sorts after 'z' in Swedish),
 * and tailored casing is a per-locale exception to the default mapping ('i' uppercases to 'İ' in
 * Turkish). Both live in CLDR's data, which is ICU's reason to exist and 10 MB of tables we are
 * not writing.
 *
 * So ICU is a FEATURE BUILD, off by default: `just runtime-intl` produces build-intl/libjsrt.a
 * and `STATOR_RUNTIME=intl` links against it. This file compiles in BOTH builds. Without ICU the
 * three entry points are STA2005 aborts naming the flag, so a program that reaches them fails
 * loudly with an actionable message rather than failing to LINK with a mangled symbol name -- the
 * gate refuses them long before that, and this is what makes the gate's refusal an optimisation
 * rather than the only thing standing between the user and a linker error. */

#include "jsrt.h"
#include "jsrt_value.h"

#ifdef JSRT_HAVE_ICU

#include <stdio.h>
#include <stdlib.h>

#include <unicode/ucol.h>
#include <unicode/uloc.h>
#include <unicode/ustring.h>
#include <unicode/utypes.h>

/* The gate accepts only string arguments here, but the tag is settled again at the boundary: an
 * untyped js-mode value reaches these with whatever it actually holds (the JSON.parse rule). */
static const JSString *subject_of(jsrt_value v, const char *method) {
  if (!jsrt_is(v, JSRT_TAG_STRING)) {
    char msg[160];
    snprintf(msg, sizeof msg,
             "STA2005: String.prototype.%s of a value that is not a string is not yet supported",
             method);
    jsrt_panic(msg);
  }
  return (const JSString *)jsrt_ptr(v);
}

/* A BCP 47 language tag ("de-DE", "tr") into the ICU locale id the C API takes ("de_DE", "tr").
 * The conversion is uloc_forLanguageTag's, not ours: it is also the validity check, and §9.2.1
 * (IsStructurallyValidLanguageTag) is exactly the grammar it implements. */
static void locale_id(jsrt_value locales, char *out, size_t cap) {
  const JSString *tag = subject_of(locales, "toLocale*");
  char ascii[128];
  if (tag->length >= sizeof ascii) {
    jsrt_panic("STA2005: a locale tag that long is not a valid language tag; the spec throws "
               "RangeError, which builtins cannot raise yet");
  }
  for (uint32_t i = 0; i < tag->length; i++) {
    if (tag->data[i] > 0x7Fu) {
      jsrt_panic("STA2005: a locale tag is ASCII; the spec throws RangeError, which builtins "
                 "cannot raise yet");
    }
    ascii[i] = (char)tag->data[i];
  }
  ascii[tag->length] = '\0';
  UErrorCode status = U_ZERO_ERROR;
  uloc_forLanguageTag(ascii, out, (int32_t)cap, NULL, &status);
  if (U_FAILURE(status)) {
    jsrt_panic("STA2005: that is not a valid language tag; the spec throws RangeError, which "
               "builtins cannot raise yet");
  }
}

/* §22.1.3.12. The spec leaves the ORDER implementation-defined and only pins the sign, which is
 * why the collator's three-way answer is narrowed to -1/0/1 here: that is what V8 returns, and
 * the golden tests are byte-for-byte against it. */
jsrt_value jsrt_string_locale_compare(jsrt_value s, jsrt_value that, jsrt_value locales) {
  const JSString *a = subject_of(s, "localeCompare");
  const JSString *b = subject_of(that, "localeCompare");
  char loc[ULOC_FULLNAME_CAPACITY];
  locale_id(locales, loc, sizeof loc);
  UErrorCode status = U_ZERO_ERROR;
  UCollator *collator = ucol_open(loc, &status);
  /* A locale ICU has no tailoring for is a WARNING, not a failure: it falls back to the root
   * collator, which is what the spec's LookupMatcher does too. Only a real error aborts. */
  if (U_FAILURE(status) || collator == NULL) {
    jsrt_panic("STA2005: this platform's ICU cannot open a collator for that locale");
  }
  const UCollationResult order =
      ucol_strcoll(collator, a->data, (int32_t)a->length, b->data, (int32_t)b->length);
  ucol_close(collator);
  return jsrt_number(order == UCOL_LESS ? -1 : order == UCOL_GREATER ? 1 : 0);
}

/* §22.1.3.26 / §22.1.3.27. Two calls, not one: ICU's UTF-16 APIs preflight, so the first asks
 * how long the answer is (case mapping lengthens -- 'ß' uppercases to "SS") and the second
 * writes it. Guessing a bound and retrying would be the same two calls with a wrong guess in
 * between. */
static jsrt_value case_locale(jsrt_value s, jsrt_value locales, bool upper) {
  const JSString *str = subject_of(s, upper ? "toLocaleUpperCase" : "toLocaleLowerCase");
  char loc[ULOC_FULLNAME_CAPACITY];
  locale_id(locales, loc, sizeof loc);
  UErrorCode status = U_ZERO_ERROR;
  const int32_t need = upper ? u_strToUpper(NULL, 0, str->data, (int32_t)str->length, loc, &status)
                             : u_strToLower(NULL, 0, str->data, (int32_t)str->length, loc, &status);
  /* Preflighting always reports U_BUFFER_OVERFLOW_ERROR; only a DIFFERENT failure is one. */
  if (status != U_BUFFER_OVERFLOW_ERROR && U_FAILURE(status)) {
    jsrt_panic("STA2005: this platform's ICU cannot case-map that string");
  }
  uint16_t *out = (uint16_t *)malloc((size_t)(need == 0 ? 1 : need) * sizeof(uint16_t));
  if (out == NULL) {
    jsrt_panic("out of memory: locale case mapping");
  }
  status = U_ZERO_ERROR;
  if (upper) {
    u_strToUpper(out, need, str->data, (int32_t)str->length, loc, &status);
  } else {
    u_strToLower(out, need, str->data, (int32_t)str->length, loc, &status);
  }
  if (U_FAILURE(status)) {
    jsrt_panic("STA2005: this platform's ICU cannot case-map that string");
  }
  jsrt_value result = jsrt_string_from_units(out, (uint32_t)need);
  free(out);
  return result;
}

jsrt_value jsrt_string_to_locale_upper_case(jsrt_value s, jsrt_value locales) {
  return case_locale(s, locales, true);
}

jsrt_value jsrt_string_to_locale_lower_case(jsrt_value s, jsrt_value locales) {
  return case_locale(s, locales, false);
}

#else /* !JSRT_HAVE_ICU -- the default build */

#define NO_ICU                                                                                     \
  "STA2005: the locale-sensitive string methods need the ICU feature build; rebuild with "         \
  "`just runtime-intl` and compile with STATOR_RUNTIME=intl"

jsrt_value jsrt_string_locale_compare(jsrt_value s, jsrt_value that, jsrt_value locales) {
  (void)s;
  (void)that;
  (void)locales;
  jsrt_panic(NO_ICU);
}

jsrt_value jsrt_string_to_locale_upper_case(jsrt_value s, jsrt_value locales) {
  (void)s;
  (void)locales;
  jsrt_panic(NO_ICU);
}

jsrt_value jsrt_string_to_locale_lower_case(jsrt_value s, jsrt_value locales) {
  (void)s;
  (void)locales;
  jsrt_panic(NO_ICU);
}

#endif
