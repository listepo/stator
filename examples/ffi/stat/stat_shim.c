/* The accessor implementations: `stat(2)` into a stack `struct stat`, one field
 * out per function. Compiled through the fixture-C path (`-std=c11 -Wall
 * -Wextra -Werror`), linked through `--link=` — the same channel the golden
 * `extern_ptr` fixture's `ffi.c` rides.
 */
#include "stat_shim.h"

#include <sys/stat.h>

double stat_size(const char *path) {
  struct stat st;
  if (stat(path, &st) != 0) {
    return -1.0;
  }
  return (double)st.st_size;
}

double stat_mtime(const char *path) {
  struct stat st;
  if (stat(path, &st) != 0) {
    return -1.0;
  }
  return (double)st.st_mtime;
}
