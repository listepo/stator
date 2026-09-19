// First-party `std/path` C shims (docs/STD.md §5, T10.1 step 2): tiny POSIX string
// walkers the golden harness compiles beside the entry (fixture-build `compileFixtureC`)
// and the emitter calls as ordinary externs — the extern_ptr precedent, not new runtime
// code. Headerless by the same rule as extern_ptr's `ffi.c`: the shims traffic only in
// C strings and doubles, so no `jsrt_value.h` is needed. Returned buffers are LEAKED
// deliberately: a `cstring` return is copied out by the emitter (`from_cstr`) and never
// freed by either side (docs/FFI.md §3 — the library's pointer, NULL-checked before the
// copy), so freeing here would be a use-after-free and keeping them is the contract.
// Pure walkers: no filesystem access, no locale. Invalid UTF-8 cannot arrive (callers
// pass runtime strings, already decoded); embedded NUL truncates at the C boundary by
// CString construction (docs/FFI.md §3).
#include <stdlib.h>
#include <string.h>

static char *std_path_dup(const char *start, size_t len) {
  char *out = (char *)malloc(len + 1);
  if (out == NULL) {
    return NULL;
  }
  memcpy(out, start, len);
  out[len] = '\0';
  return out;
}

double std_path_is_absolute(const char *path) {
  return (path != NULL && path[0] == '/') ? 1.0 : 0.0;
}

char *std_path_basename(const char *path) {
  if (path == NULL || path[0] == '\0') {
    return std_path_dup("", 0);
  }
  size_t len = strlen(path);
  while (len > 1 && path[len - 1] == '/') {
    len--;
  }
  if (len == 1 && path[0] == '/') {
    return std_path_dup("/", 1);
  }
  size_t end = len;
  while (end > 0 && path[end - 1] != '/') {
    end--;
  }
  size_t start = end;
  return std_path_dup(path + start, len - start);
}

char *std_path_dirname(const char *path) {
  if (path == NULL || path[0] == '\0') {
    return std_path_dup(".", 1);
  }
  size_t len = strlen(path);
  while (len > 1 && path[len - 1] == '/') {
    len--;
  }
  size_t end = len;
  while (end > 0 && path[end - 1] != '/') {
    end--;
  }
  if (end == 0) {
    return std_path_dup(".", 1);
  }
  while (end > 1 && path[end - 2] == '/') {
    end--;
  }
  if (end == 1 && path[0] == '/') {
    return std_path_dup("/", 1);
  }
  return std_path_dup(path, end - 1);
}

char *std_path_join_two(const char *a, const char *b) {
  const char *left = (a != NULL) ? a : "";
  const char *right = (b != NULL) ? b : "";
  if (right[0] == '/') {
    return std_path_dup(right, strlen(right));
  }
  size_t left_len = strlen(left);
  while (left_len > 0 && left[left_len - 1] == '/') {
    left_len--;
  }
  size_t right_start = 0;
  while (right[right_start] == '/') {
    right_start++;
  }
  size_t right_len = strlen(right + right_start);
  size_t total = left_len + 1 + right_len;
  char *out = (char *)malloc(total + 1);
  if (out == NULL) {
    return NULL;
  }
  memcpy(out, left, left_len);
  out[left_len] = '/';
  memcpy(out + left_len + 1, right + right_start, right_len);
  out[total] = '\0';
  return out;
}
