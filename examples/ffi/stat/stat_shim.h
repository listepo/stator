/* Demo-local accessor shim for the struct-by-pointer step-1 example (plan.md §10
 * Task 7.3 step 1). v0 has no struct spelling, so NOTHING here names
 * `struct stat` at the boundary: each accessor opens the struct in C (where
 * `offsetof` is the compiler's business, never a literal) and returns one
 * field narrowed to `double`. int64 fields (`st_size`, `st_mtime`) cross as
 * `double` — exact for real files, documented at the declaration, never a
 * silent widening of a 64-bit C type through the ABI table. A missing file is
 * -1 (data the caller compares, not an error convention).
 */
#ifndef STATOR_FFI_STAT_SHIM_H
#define STATOR_FFI_STAT_SHIM_H

double stat_size(const char *path);
double stat_mtime(const char *path);

#endif
