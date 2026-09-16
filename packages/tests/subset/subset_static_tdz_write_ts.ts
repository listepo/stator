// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Static methods and static class members
// A block that touches a later static is a TDZ violation the checker refuses (`used before
// its initialization`) — in ts mode and (unsuppressed) in js mode too. TDZ itself is
// unmodelled (plan.md §8 step 2a(c)); the ordering half — fields after a block that do not
// touch it — compiles (subset_static_block_ts).

class C {
  static {
    C.n = 1;
  }
  static n = 2;
}
export const x = C.n;
