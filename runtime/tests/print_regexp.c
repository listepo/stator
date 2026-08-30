/* print_regexp.c — the regexp engine and its printing, checked against Node.
 *
 * Ground truth is Node, not a table written here: runtime/tests/print_regexp.mjs builds the SAME
 * patterns in the same order and prints the same answers with console.log; `make -C runtime test`
 * diffs the two byte-for-byte. Keep the two corpora in the same order or the diff means nothing.
 *
 * The engine is quickjs-ng's libregexp, vendored (runtime/vendor/quickjs-ng). What is under test
 * here is therefore not "does a regex engine work" but the BRIDGE: the pattern reaching the
 * compiler as UTF-8, the subject reaching the executor as UTF-16 code units with no copy, the flag
 * letters mapping to the engine's bits, and `lastIndex` behaving as state on the pattern rather
 * than on the match -- which is why the /g cases below call test() repeatedly and print each answer.
 */

#include "corpus.h"

#include <stdio.h>

static jsrt_value re(const char *source, const char *flags) {
  return jsrt_regexp_new(str(source), str(flags));
}

static void show_test(jsrt_value pattern, const char *subject) {
  jsrt_print(jsrt_bool(jsrt_regexp_test(pattern, str(subject))));
}

int main(void) {
  /* Printing: `/source/flags`, at the top level and inside a structure, unquoted in both. */
  jsrt_print(re("a", ""));
  jsrt_print(re("ab+c", "gi"));
  jsrt_print(re("", ""));
  jsrt_print(re("\\d+", "gimsuy"));
  jsrt_value holder = jsrt_array_new(0, NULL);
  jsrt_array_push(holder, re("x", "g"));
  jsrt_array_push(holder, str("after"));
  jsrt_print(holder);
  /* A regexp has no enumerable own properties, so JSON.stringify sees an empty object. */
  jsrt_print(jsrt_json_stringify(re("a", "g")));

  /* The basics: literals, classes, quantifiers, anchors, alternation. */
  jsrt_value digits = re("^[0-9]+$", "");
  show_test(digits, "123");
  show_test(digits, "12a");
  show_test(digits, "");
  jsrt_value word = re("\\bcat\\b", "");
  show_test(word, "a cat here");
  show_test(word, "concatenate");
  jsrt_value alt = re("^(?:foo|bar)$", "");
  show_test(alt, "foo");
  show_test(alt, "bar");
  show_test(alt, "baz");

  /* Case folding, with and without the flag, ASCII and beyond it. */
  jsrt_value ci = re("stra(ss|ß)e", "i");
  show_test(ci, "STRASSE");
  show_test(ci, "Straße");
  show_test(re("ä", "i"), "Ä");
  show_test(re("ä", ""), "Ä");

  /* Dot, multiline and dotall: the three flags that change what a boundary means. */
  jsrt_value dot = re("a.b", "");
  show_test(dot, "a\nb");
  show_test(re("a.b", "s"), "a\nb");
  show_test(re("^b", ""), "a\nb");
  show_test(re("^b", "m"), "a\nb");

  /* Unicode: without /u a surrogate pair is two units, with it one code point. */
  show_test(re("^.$", ""), "\xF0\x9F\x98\x80");
  show_test(re("^.$", "u"), "\xF0\x9F\x98\x80");
  show_test(re("\\p{Letter}", "u"), "é");
  show_test(re("\\p{Letter}", "u"), "1");

  /* Backreferences and lookaround, which are the parts an engine is easy to be missing. */
  show_test(re("(ab)\\1", ""), "abab");
  show_test(re("(ab)\\1", ""), "abcd");
  show_test(re("foo(?=bar)", ""), "foobar");
  show_test(re("foo(?=bar)", ""), "foobaz");
  show_test(re("(?<!a)b", ""), "cb");
  show_test(re("(?<!a)b", ""), "ab");
  show_test(re("(?<year>[0-9]{4})", ""), "in 2026");

  /* lastIndex is state on the PATTERN: a /g regexp walks its subject across calls and resets when
   * it falls off the end, which is what makes a `while (re.test(s))` loop terminate. */
  jsrt_value global = re("a", "g");
  show_test(global, "aab");
  show_test(global, "aab");
  show_test(global, "aab");
  show_test(global, "aab");
  /* A sticky pattern must match AT lastIndex, not merely at or after it. */
  jsrt_value sticky = re("a", "y");
  show_test(sticky, "ba");
  show_test(sticky, "ab");
  show_test(sticky, "ab");
  /* Without either flag, lastIndex is not consulted and every call starts at 0. */
  jsrt_value plain = re("a", "");
  show_test(plain, "aa");
  show_test(plain, "aa");

  return 0;
}
