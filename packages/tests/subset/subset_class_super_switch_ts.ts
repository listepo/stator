// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class inheritance and `super(...)` (plan.md §8 step 12(d), plan-notes 277).
// A `switch` over the discriminant guards one `super(...)` per arm the same way an
// `if`/`else` chain does, but the coverage analysis counts only `if`/`else` arms and
// bare blocks: `switch` fallthrough means a clause's statements are not one path, a
// missing `default` leaves the no-match path uncovered, and a discriminant or case
// test reading `this`/`super` runs before any call. All three stay refused —
// `nestedSuperCall` catches the switch statement as a nested position, honestly
// deferred while `if`/`else` arms land.

class B {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
}

class D extends B {
  constructor(tag: number, n: number) {
    switch (tag) {
      case 0:
        super(n);
        break;
      default:
        super(n * 2);
        break;
    }
  }
}

export const x = new D(0, 21).n + new D(1, 21).n;
