// Opaque pointers round-tripped borrow-only (docs/FFI.md, plan.md section 10 Task 7.1
// steps 6–7): a sentinel handle through the fixture C (no header — `void *` forward
// declarations), and two malloc'd blocks through real libc (header pragmas — the true
// `size_t` prototypes govern). Every handle crosses untouched and is freed by its owner:
// the sentinel is static, the blocks by an explicit free in the same binding.
static int sentinel;

void *ptr_make(void) {
  return &sentinel;
}

double ptr_check(void *box) {
  return box == &sentinel ? 1.0 : 0.0;
}
