/* The SQLite-demo C consumer (plan.md §10 Task 7.3 Check) — a small C main() calling
 * the SQLite demo unit (`examples/ffi/sqlite/demo.ts`, `--unit-name sqlitedemo`) through
 * the emitted header, asserting a success call (`runDemo` returns the row count 2) AND
 * the error path (`runBadSql` throws through the nonzero convention: zero sentinel +
 * `stator_sqlitedemo_last_error`). Compiles under the same C11 -Wall -Wextra -Werror
 * discipline as the runtime; output is deterministic (see expected-c.txt).
 *
 * Stdout never embeds the error-cell text: the cell names the demo's TS function, so
 * printing it would couple this file (and expected-c.txt) to the demo's identifiers.
 * The message is asserted with strstr and a fixed line is printed instead.
 */
#include "sqlitedemo.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

int main(void) {
  /* Init is idempotent (set-before static guard): calling twice must be a no-op. */
  stator_sqlitedemo_init();
  stator_sqlitedemo_init();
  assert(stator_sqlitedemo_last_error() == NULL);
  assert(stator_sqlitedemo_runDemo() == 2.0);
  assert(stator_sqlitedemo_last_error() == NULL);
  printf("rows=2\n");
  /* The nonzero-convention failure: zero sentinel plus a message naming the failure. */
  assert(stator_sqlitedemo_runBadSql() == 0.0);
  const char *err = stator_sqlitedemo_last_error();
  assert(err != NULL);
  assert(strstr(err, "failed") != NULL);
  printf("bad-sql captured\n");
  /* Recovery: the next successful call clears the cell (cleared on every stub entry). */
  assert(stator_sqlitedemo_runDemo() == 2.0);
  assert(stator_sqlitedemo_last_error() == NULL);
  printf("recovered=2\n");
  printf("sqlite-c-main ok\n");
  return 0;
}
