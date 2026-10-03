// @mode: js
// @verdict: static
// SUBSET.md: console
// The js-mode twin: an object literal's own toString and valueOf are what `%s` and `%d` run
// (plan.md §9 Task 6.27).

const tag = {
  toString() {
    return 'tag';
  },
  valueOf() {
    return 3;
  },
};
console.log('%s %d %i %f', tag, tag, tag, new Date(0));
