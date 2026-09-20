// @mode: js
// @verdict: error
// @code: STA0012
// SUBSET.md: Static methods and static class members
// A block that touches a later static is a TDZ violation the checker refuses (`used before
// its initialization`) — unsuppressed in js mode, since TDZ is unmodelled (plan.md §8 step
// 2a(c)), not untyped. The ordering half — fields after a block that do not touch it —
// compiles (subset_static_block_js).

class C {
  static {
    C.n = 1;
  }
  static n = 2;
}
export const x = C.n;
