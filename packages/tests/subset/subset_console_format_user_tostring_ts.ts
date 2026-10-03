// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: console
// `%s` of an object whose toString is its own is String(obj), which runs that method; the
// runtime's ToPrimitive never calls user code, so the call is refused (plan.md §9 Task 6.24).

class Tag {
  toString(): string {
    return 'tag';
  }
}
console.log('%s', new Tag());
