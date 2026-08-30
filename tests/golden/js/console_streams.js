// console beyond log in js mode: same five methods, same two streams.

console.log("to stdout");
console.info("info is stdout");
console.debug("debug is stdout");
console.error("to stderr");
console.warn("warn is stderr");
console.error([1, 2, 3]);
console.warn({ x: 1 });

console.group('js group');
console.log('inside');
console.dir('quoted');
console.group('nested');
console.log([1, [2, [3]]]);
console.warn('grouped warn');
console.groupEnd();
console.groupEnd();
console.count('a');
console.count('a');
console.countReset('a');
console.count('a');
console.assert(false, 'js assert');

// An EXPLICIT undefined is not an omitted argument for group/assert -- Node prints what it was
// handed -- while for count it is exactly the absent case.
console.group(undefined);
console.log('explicitly grouped');
console.groupEnd();
console.assert(false, undefined);
console.count(undefined);
