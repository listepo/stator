/* jsrt_panic.c — fatal error handler with stack trace. */

#include "jsrt.h"

#include "jsrt_value.h"

#include <stdio.h>
#include <stdlib.h>

_Noreturn void jsrt_panic(const char *msg) {
  /* Print the error message. */
  fprintf(stderr, "PANIC: %s\n", msg);

  /* Count and print the shadow-stack frame depth. */
  uint32_t frame_count = 0;
  JSRTFrame *frame = jsrt_frame_top;
  while (frame != NULL) {
    frame_count++;
    frame = frame->prev;
  }

  fprintf(stderr, "Shadow stack depth: %u frames\n", frame_count);

  /* Abort. */
  abort();
}
