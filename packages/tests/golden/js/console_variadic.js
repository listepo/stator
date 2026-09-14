// Variadic console in js mode (plan.md §8 step 18): same joining as ts mode — every
// argument inspected, one space between forms, the bare newline for no arguments.

console.log(1, 'two', true);
console.log();
console.error('boom', 42, [1, 2]);
console.warn('w', -0, NaN, Infinity);
console.info('i', null, undefined, 1.5);
console.debug('d', 'x', 'y');
console.log([1, 2], { x: 1 }, 'tail');
console.log({ nested: { deep: [1, [2]] } }, 'after');
console.log(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

// The one-argument call keeps its entry point: these lines pin the unchanged path.
console.log('single');
console.error(-0);
console.log([1, 2, 3]);

// A console call is still `undefined` in value position, at any width.
const r = console.log('v', 'w');
console.log(r);

// Arguments evaluate left to right into rooted slots: `f` runs between the two reads.
function f() {
  console.log('in-f');
  return 10;
}
const arr = [1, 2, 3];
console.log(arr[0], f(), arr[2]);
