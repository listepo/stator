// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- a class EXPRESSION is a value, and a value needs the class object
// (plan.md §8 step 12e), which does not exist here. A declaration lowers to a descriptor plus
// bindings and compiles; `const C = class { … }` stays not-yet. Expected message (pinned in
// gate.test.ts -- explain reports verdicts, not prose): "an anonymous class expression is not
// yet supported; planned for Phase 5".

const C = class {
  m() {
    return 7;
  }
};
export const x = typeof C;
