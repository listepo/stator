// console.log's placeholders (plan.md §9 Task 6.24): with two or more arguments and a string
// first, `%s %d %i %f %j %o %O %c` each consume the next argument and `%%` is one `%` — Node's
// util.format. Every specifier, the literal `%` cases, an exhausted argument list and the
// arguments past the last placeholder, on both streams.

class Point {
  x: number = 1;
  y: number = 2;
}

const n: number = 5;
const name: string = 'fmt';

// %s: a number keeps -0; another primitive is String(); an object inspects at depth 0.
console.log('%s', name, n);
console.log('%s=%d', 'n', n);
console.log('%s|%s|%s|%s|%s', null, undefined, true, -0, 1e21);
console.log('%s', { a: 1, b: { c: 1 } });
console.log('%s', [1, [2, [3]]]);
console.log('%s', new Point());
const map = new Map<string, number>();
map.set('k', 1);
console.log('%s', map);
console.log('%s', new Date(0));

// %d is Number(), %i parseInt(), %f parseFloat() — each printed with -0 visible.
console.log('%d %d %d %d %d', '42', '', true, null, undefined);
console.log('%d|%d|%d|%d', '42abc', '0x1f', -0, '-0');
console.log('%d', [5]);
console.log('%i %i %i %i %i', '42.9abc', -0, 1.5, '0x1f', '-0');
console.log('%i', new Date(0));
console.log('%f %f %f %f', '1.5e3x', 'abc', 2.5, '-0');

// %j is JSON.stringify; %O inspects at the default depth; %o equals %O for a primitive.
console.log('%j', { a: [1, 'x'], b: null, c: 'q"' });
console.log('%j %j %j', 'str', -0, NaN);
console.log('%O', { a: 1, b: { c: { d: { e: 1 } } } });
console.log('%O %O', 'quoted', [1, 'a']);
console.log('%o %o %o', 'str', 7, null);

// %c consumes its CSS and prints nothing.
console.log('%c styled', 'color: red');

// `%%` collapses with or without arguments left; a lone or trailing `%` is literal.
console.log('100%', n);
console.log('%', n);
console.log('a%%b', n);
console.log('%%%s%%', 'x');
console.log('%s%', 'x');
console.log('%%');

// Too few arguments: the unmatched placeholders stay as written. Too many: the rest are
// appended, a string bare and anything else inspected.
console.log('%s %s %d', 'one');
console.log('%s:%s', 'a', 'b', 'c', { z: 1 }, [1]);
console.log('%x %s', 'one', 'two');
console.log(n, '%s', 'x');
console.log('é%sü', '漢');

// error/warn/info/debug format the same way, each on its own stream.
console.error('%s err %d', 'e', 3);
console.warn('%j', [1]);
console.info('%i!', 7.9);
console.debug('%f?', '2.5');
