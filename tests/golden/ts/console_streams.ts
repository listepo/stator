// console beyond log (Task 4.2): error and warn inspect onto STDERR with log's exact formatting;
// info and debug are stdout, like log. The golden runner compares both streams byte-for-byte.

console.log("to stdout");
console.info("info is stdout");
console.debug("debug is stdout");
console.error("to stderr");
console.warn("warn is stderr");
console.error([1, 2, 3]);
console.warn({ x: 1 });
console.error(-0);
const n: number = 42;
console.warn(n * 2);

// group indents EVERY line of every later console write, on both streams, including each line of
// a multi-line inspect; groupEnd bottoms out at zero rather than erroring.
console.group('outer');
console.log('a');
console.log([1, 2, 3]);
console.group();
console.log({ x: 1, y: { z: 2 } });
console.log('deep\nmultiline');
console.error('grouped stderr');
console.groupEnd();
console.log('back');
console.groupEnd();
console.log('root');
console.groupEnd();
console.log('unmatched groupEnd is a no-op');

// dir is log's formatting without the bare-string exception.
console.dir('a string');
console.dir(42);
console.dir([1, 2]);
console.dir({ a: 1 });
console.dir(true);
console.dir(null);

// count tallies per label, countReset zeroes one and prints nothing.
console.count();
console.count();
console.count('x');
console.count('x');
console.countReset('x');
console.count('x');
console.count();

// assert prints only on a falsy condition, to stderr, with the message when one is given.
console.assert(true, 'never');
console.assert(false, 'boom');
console.assert(false);
const one: number = 1;
console.assert(one === 1, 'fine');
console.assert(one === 0, 'nope');

// An EXPLICIT undefined is not an omitted argument for these two: Node prints the label and the
// message it was handed, where the short forms print neither. The two spellings reach two runtime
// entry points, which is what keeps this pair honest.
console.group(undefined);
console.log('explicitly grouped');
console.groupEnd();
console.assert(false, undefined);
// count is the contrast: for it, explicit undefined IS the absent case -- both spellings tally
// under "default", which is why it pads where group and assert do not.
console.count(undefined);
