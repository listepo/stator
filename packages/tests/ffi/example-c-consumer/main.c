/* Task 7.2 step 9: the CI example consumer (plan.md §10) — a small C main() calling
 * the exported TS unit through the emitted header, asserting a success call AND the
 * error path. Compiles under the same C11 -Wall -Wextra -Werror discipline as the
 * runtime; output is deterministic (see expected.txt).
 */
#include "consumer.h"

#include <assert.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

int main(void) {
  stator_consumer_init();
  stator_consumer_init();
  assert(stator_consumer_last_error() == NULL);
  assert(stator_consumer_add(40.0, 2.0) == 42.0);
  assert(stator_consumer_last_error() == NULL);
  printf("add=42\n");
  assert(stator_consumer_isPositive(3.0) == true);
  assert(stator_consumer_isPositive(-3.0) == false);
  assert(stator_consumer_last_error() == NULL);
  printf("positive=1\n");
  assert(stator_consumer_boom(-1.0) == 0.0);
  const char *err = stator_consumer_last_error();
  assert(err != NULL);
  assert(strstr(err, "neg") != NULL);
  printf("captured: %s\n", err);
  assert(stator_consumer_boom(7.0) == 7.0);
  assert(stator_consumer_last_error() == NULL);
  printf("recovered=7\n");
  printf("c-consumer ok\n");
  return 0;
}
