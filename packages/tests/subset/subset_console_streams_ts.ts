// @mode: ts
// @verdict: static
// SUBSET.md: console

console.error('e');
console.warn('w');
console.info('i');
console.debug('d');
console.dir([1, 2]);
console.group('g');
console.groupEnd();
console.count();
console.count('label');
console.countReset('label');
console.assert(true);
console.assert(false, 'why');
console.group(undefined);
console.groupEnd();
console.assert(false, undefined);
console.count(undefined);
