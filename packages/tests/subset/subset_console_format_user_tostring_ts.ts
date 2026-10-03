// @mode: ts
// @verdict: static
// SUBSET.md: console
// `%s` of an object whose toString is its own is String(obj), which runs that method, and the
// numeric placeholders run an object's own valueOf/toString (plan.md §9 Task 6.27).

class Tag {
  toString(): string {
    return 'tag';
  }
  valueOf(): number {
    return 3;
  }
}
console.log('%s %d %i %f', new Tag(), new Tag(), new Tag(), new Date(0));
