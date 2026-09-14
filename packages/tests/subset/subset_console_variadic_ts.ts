// @mode: ts
// @verdict: static
// SUBSET.md: console
// The five printing methods are variadic (plan.md §8 step 18): any width is static, including
// none. `dir` stays unary — its second argument in Node is an options object, not a value.

const n: number = 1;
const s: string = 'two';
console.log(n, s, true);
console.log();
console.error('e1', 'e2');
console.warn('w', n);
console.info('i', s);
console.debug('d', null, undefined);
console.log([1, 2], { x: 1 });
