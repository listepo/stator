// @mode: ts
// @verdict: not-yet
// @code: STA1201
// SUBSET.md: generator methods stay refused (receiver-in-env, like async methods)

class C {
  *m(): Generator<number> {
    yield 1;
  }
}
export { C };
