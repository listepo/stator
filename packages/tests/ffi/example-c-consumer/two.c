/* Task 7.4 Check: two Stator static libraries in one C program (plan.md §10). Each library
 * carries a private runtime; Boehm is one collector per process, shared by both. With Boehm,
 * every round forces a collection, and the run fails unless the collections happened and the
 * keeper library's strings all survived them. Output is deterministic (static-lib.ts). */
#include "consumer.h"
#include "keeper.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

#ifdef STATOR_TEST_BOEHM
#include <stddef.h>
void GC_gcollect(void);
size_t GC_get_gc_no(void);
#endif

int main(void) {
  stator_consumer_init();
  stator_keeper_init();
  for (int round = 0; round < 10; round++) {
    assert(stator_keeper_grow(500.0) == 500.0 * (round + 1));
    assert(stator_consumer_add(round, 1.0) == round + 1.0);
#ifdef STATOR_TEST_BOEHM
    GC_gcollect();
#endif
  }
  /* Unbounded recursion in one library: its stack guard throws, the other library is untouched. */
  assert(stator_keeper_deep() == 0.0);
  assert(strstr(stator_keeper_last_error(), "Maximum call stack size exceeded") != NULL);
  assert(stator_consumer_add(2.0, 3.0) == 5.0);
  assert(stator_consumer_boom(-1.0) == 0.0);
  assert(stator_consumer_last_error() != NULL);
  assert(stator_keeper_grow(0.0) == 5000.0 && stator_keeper_last_error() == NULL);
#ifdef STATOR_TEST_BOEHM
  assert(GC_get_gc_no() >= 10);
#endif
  printf("keeper=%g\n", stator_keeper_check());
  printf("two libraries ok\n");
  return 0;
}
