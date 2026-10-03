// console.log's placeholders in js mode (plan.md §9 Task 6.24): the same util.format rules over
// untyped values, plus the cases only a dynamic program reaches — a format string built at run
// time, a cyclic `%j`, and a `%j` getter that throws before anything is written.

const self = {};
self.self = self;
let format = '%s|%d|%i|%f';

console.log(format, 'a', '7', '8.5', '9.5', 'extra');
console.log('%j', self);
console.log('%j and %j', [self], function () {});
console.log('%j', undefined, 1);
console.log('%s', { a: { b: 1 } });
console.log('%o', 5, [1]);
console.log('%O', { k: [1, 2] });
console.log('%s %o', 'x');
console.log('%d', { n: 3 });
console.log('%c%s%%', 'css', 'pct');
try {
  console.log('%j', {
    get x() {
      throw new Error('getter');
    },
  });
} catch (e) {
  console.log('caught', e.message);
}
console.error('%s:%d', 'line', 12);
