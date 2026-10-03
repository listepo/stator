// @mode: js
// @verdict: static
// SUBSET.md: console
// The js-mode twin: an untyped argument and a format built at run time are the runtime's to
// settle, and it refuses loudly (STA2005) where it cannot print what Node prints.

const box = { n: 3 };
let format = '%s|%d';
console.log(format, 'a', '7');
console.log('%j %d %o', box, box, 4);
console.warn('%s', box);
