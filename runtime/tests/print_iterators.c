/* Receiver checks must fail before any iterator/generator-specific pointer is dereferenced. */
#include "corpus.h"

#include <assert.h>

static void check_error(void) {
  assert(jsrt_pending());
  const jsrt_value error = jsrt_take_exception();
  assert(jsrt_instanceof(error, &jsrt_class_type_error));
  jsrt_print(jsrt_get_prop(error, "name", NULL));
}

int main(void) {
  jsrt_init();
  JSRT_FRAME(2);
  JSRT_LOCAL(0) = jsrt_dynobj_new();
  JSRT_LOCAL(1) = jsrt_array_new(0, NULL);
  const jsrt_value invalid[] = {JSRT_UNDEFINED, JSRT_NULL, JSRT_TRUE, num(1),
                                JSRT_LOCAL(0), JSRT_LOCAL(1)};
  for (size_t i = 0; i < sizeof invalid / sizeof invalid[0]; i++) {
    jsrt_value out = num(9);
    assert(!jsrt_iterator_step(invalid[i], &out));
    check_error();
    assert(jsrt_iterator_next(invalid[i], JSRT_UNDEFINED) == JSRT_UNDEFINED);
    check_error();
    assert(jsrt_generator_close(invalid[i], JSRT_UNDEFINED) == JSRT_UNDEFINED);
    check_error();
    assert(jsrt_generator_throw(invalid[i], num(42)) == JSRT_UNDEFINED);
    check_error();
  }
  JSRT_FRAME_POP();
  return 0;
}
