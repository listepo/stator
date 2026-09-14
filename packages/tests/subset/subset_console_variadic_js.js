// @mode: js
// @verdict: static
// SUBSET.md: console
// The five printing methods are variadic (plan.md §8 step 18): any width is static, including
// none. `dir` stays unary — its second argument in Node is an options object, not a value.

console.log(1, 'two', true);
console.log();
console.error('e1', 'e2');
console.warn('w', 1);
console.info('i', 's');
console.debug('d', null, undefined);
console.log([1, 2], { x: 1 });
