// @mode: ts
// @verdict: static
// SUBSET.md: console
// util.format placeholders (plan.md §9 Task 6.24): with two or more arguments and a string first,
// `%s %d %i %f %j %O %c %%` apply, and `%o` applies to a primitive. Each value below is one the
// runtime prints as Node does, so the whole call is static.

const n: number = 5;
console.log('%s=%d %i %f', 'n', n, '7.9', '2.5');
console.log('%j %O %o %c%%', { a: [1] }, { b: 2 }, 'str', 'color: red');
console.error('%s', [1, 2]);
