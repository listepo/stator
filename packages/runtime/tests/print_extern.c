/* print_extern.c — the extern (C-from-TS) boundary conversions (docs/FFI.md §5).
 *
 * Ground truth is Node: print_extern.mjs prints the SAME successful conversions, in the same
 * order; `just runtime-test` diffs the two byte-for-byte. What cannot go through the diff is
 * pinned here instead: exact output bytes (a print would only show what this file already
 * believes -- the lone-surrogate precedent print_numbers.c cites), and the STA2001 aborts,
 * which panic and would kill the corpus run. Each abort case runs in a forked child whose
 * stderr must carry STA2001 and the baked location.
 */

#include "corpus.h"

#include <assert.h>
#include <errno.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

/* The baked `file:line:col` every abort case below passes; the parent matches it back out
 * of the child's stderr, which is what proves the location travelled with the trap. */
#define LOC "extern-fixture.ts:4:2"

static double abort_number;
static jsrt_value abort_value;

static void abort_int32(void) { (void)jsrt_extern_int32(abort_number, LOC); }

static void abort_pointer(void) { (void)jsrt_extern_pointer(abort_value, LOC); }

/* Runs `fn` in a forked child and asserts it dies in the STA2001 trap: SIGABRT, with the
 * code and the baked location on stderr. Reaching the child's `_exit(0)` means the boundary
 * did NOT trap, which fails the parent on the signal assertion. `_exit`, never `exit`: the
 * child shares the parent's buffered stdout, and flushing it would duplicate the corpus. */
static void expect_abort(void (*fn)(void)) {
  /* Flush the corpus first: the child inherits the buffer, and abort() flushes it again
   * on the way out -- without this, every child re-prints everything buffered so far. */
  (void)fflush(stdout);
  int err[2];
  const int piped = pipe(err);
  assert(piped == 0);
  const pid_t child = fork();
  assert(child >= 0);
  if (child == 0) {
    if (dup2(err[1], STDERR_FILENO) < 0) {
      _exit(127);
    }
    close(err[0]);
    close(err[1]);
    fn();
    _exit(0);
  }
  close(err[1]);
  char buf[1024];
  size_t n = 0;
  for (;;) {
    if (n >= sizeof buf - 1) {
      break;
    }
    const ssize_t r = read(err[0], buf + n, sizeof buf - 1 - n);
    if (r == 0) {
      break;
    }
    if (r < 0) {
      assert(errno == EINTR);
      continue;
    }
    n += (size_t)r;
  }
  close(err[0]);
  int status = 0;
  const pid_t reaped = waitpid(child, &status, 0);
  assert(reaped == child);
  buf[n] = '\0';
  assert(WIFSIGNALED(status) && WTERMSIG(status) == SIGABRT);
  assert(strstr(buf, "STA2001") != NULL);
  assert(strstr(buf, LOC) != NULL);
}

/* A successful conversion, byte-checked and round-tripped for the corpus diff: the bytes
 * the helper produced must equal `expected` and decode to the string they came from, which
 * is what the .mjs half prints directly. */
static void check_utf8(jsrt_value s, const char *expected, jsrt_value *slot) {
  char *bytes = jsrt_extern_utf8(s);
  assert(strcmp(bytes, expected) == 0);
  *slot = jsrt_string_from_utf8(bytes, strlen(bytes));
  jsrt_print(*slot);
  free(bytes);
}

int main(void) {
  jsrt_init();
  JSRT_FRAME(3);

  /* int32 successes: the two range edges and small values around zero. */
  assert(jsrt_extern_int32(0.0, LOC) == 0);
  assert(jsrt_extern_int32(42.0, LOC) == 42);
  assert(jsrt_extern_int32(-42.0, LOC) == -42);
  assert(jsrt_extern_int32(2147483647.0, LOC) == INT32_MAX);
  assert(jsrt_extern_int32(-2147483648.0, LOC) == INT32_MIN);
  jsrt_print(jsrt_number((double)jsrt_extern_int32(0.0, LOC)));
  jsrt_print(jsrt_number((double)jsrt_extern_int32(42.0, LOC)));
  jsrt_print(jsrt_number((double)jsrt_extern_int32(-42.0, LOC)));
  jsrt_print(jsrt_number((double)jsrt_extern_int32(2147483647.0, LOC)));
  jsrt_print(jsrt_number((double)jsrt_extern_int32(-2147483648.0, LOC)));

  /* UTF-8 successes: one byte width each, asserted byte-exact then printed. */
  JSRT_LOCAL(0) = str("hello");
  check_utf8(JSRT_LOCAL(0), "hello", &JSRT_LOCAL(1));
  JSRT_LOCAL(0) = str("h\xC3\xA9llo");
  check_utf8(JSRT_LOCAL(0), "h\xC3\xA9llo", &JSRT_LOCAL(1));
  JSRT_LOCAL(0) = str("\xE6\x97\xA5\xE6\x9C\xAC\xE8\xAA\x9E");
  check_utf8(JSRT_LOCAL(0), "\xE6\x97\xA5\xE6\x9C\xAC\xE8\xAA\x9E", &JSRT_LOCAL(1));
  JSRT_LOCAL(0) = str("emoji: \xF0\x9F\x90\x89");
  check_utf8(JSRT_LOCAL(0), "emoji: \xF0\x9F\x90\x89", &JSRT_LOCAL(1));

  /* Embedded NUL truncates at the first NUL: the copy holds "ab" and nothing after. */
  static const uint16_t nul_units[] = {'a', 'b', 0, 'c', 'd'};
  JSRT_LOCAL(0) = jsrt_string_from_units(nul_units, 5);
  check_utf8(JSRT_LOCAL(0), "ab", &JSRT_LOCAL(1));

  /* Lone surrogates encode as themselves (the house rule), assert-only: the printer maps
   * a lone surrogate to U+FFFD while Node writes the raw bytes, so no diff could hold. */
  static const uint16_t high_unit[] = {0xD800};
  static const uint16_t low_unit[] = {0xDC00};
  static const uint16_t pair_units[] = {0xD83C, 0xDF89};
  static const char high_bytes[] = {(char)0xED, (char)0xA0, (char)0x80, 0};
  static const char low_bytes[] = {(char)0xED, (char)0xB0, (char)0x80, 0};
  static const char pair_bytes[] = {(char)0xF0, (char)0x9F, (char)0x8E, (char)0x89, 0};
  JSRT_LOCAL(0) = jsrt_string_from_units(high_unit, 1);
  {
    char *bytes = jsrt_extern_utf8(JSRT_LOCAL(0));
    assert(memcmp(bytes, high_bytes, 4) == 0);
    free(bytes);
  }
  JSRT_LOCAL(0) = jsrt_string_from_units(low_unit, 1);
  {
    char *bytes = jsrt_extern_utf8(JSRT_LOCAL(0));
    assert(memcmp(bytes, low_bytes, 4) == 0);
    free(bytes);
  }
  JSRT_LOCAL(0) = jsrt_string_from_units(pair_units, 2);
  {
    char *bytes = jsrt_extern_utf8(JSRT_LOCAL(0));
    assert(memcmp(bytes, pair_bytes, 5) == 0);
    free(bytes);
  }

  /* int32 failures: -0.0, NaN, both infinities, both range edges, both fractions. */
  static const double bad_int32[] = {-0.0, 0.0 / 0.0, 1.0 / 0.0,  -1.0 / 0.0,
                                     2147483648.0, -2147483649.0, 1.5, -1.5};
  for (size_t i = 0; i < sizeof bad_int32 / sizeof bad_int32[0]; i++) {
    abort_number = bad_int32[i];
    expect_abort(abort_int32);
  }

  /* Pointer failures: no dynamic value mints an address -- nullish, tagged, or string. */
  JSRT_LOCAL(2) = str("x");
  const jsrt_value bad_pointers[] = {JSRT_UNDEFINED, JSRT_NULL, JSRT_TRUE,
                                     jsrt_number(1.0), JSRT_LOCAL(2)};
  for (size_t i = 0; i < sizeof bad_pointers / sizeof bad_pointers[0]; i++) {
    abort_value = bad_pointers[i];
    expect_abort(abort_pointer);
  }

  JSRT_FRAME_POP();
  return 0;
}
