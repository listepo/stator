/* jsrt_process.c — the two process slots `main` owns: the argument vector it received and the
 * status it returns (docs/STD.md §5, `std/process`). The generated `main` fills the first with
 * `jsrt_process_args` before any module code runs and returns `jsrt_process_exit_code()`.
 * `std/process` reads and writes them through `@statorExtern` declarations, so the std archive
 * itself still calls only libc (docs/STD.md §6). The prototypes in jsrt_value.h are spelled
 * exactly as the emitter forward-declares an extern (`double`, `char *`), because a generated
 * unit sees both and C refuses two different spellings of one function. */

#include "jsrt_value.h"

static int process_argc;
static char **process_argv;
static int process_exit_code;

void jsrt_process_args(int argc, char **argv) {
  process_argc = argc;
  process_argv = argv;
}

double jsrt_process_argc(void) { return (double)process_argc; }

/* The caller (std/process.argv) passes only indexes below `jsrt_process_argc()`; the string is
 * copied at the extern edge and never freed, since it is `main`'s own. */
char *jsrt_process_argv(double index) {
  if (!(index >= 0 && index < (double)process_argc)) {
    return "";
  }
  return process_argv[(int)index];
}

double jsrt_process_exit_code(void) { return (double)process_exit_code; }

/* `code` is already an integer in 0..255: std/process validates it in its backing first. */
void jsrt_process_set_exit_code(double code) { process_exit_code = (int)code; }
