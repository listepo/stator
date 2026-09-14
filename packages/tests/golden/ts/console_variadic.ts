// Variadic console (plan.md §8 step 18): every argument is inspected and the forms are
// joined with one space; no arguments prints the bare newline. `error`/`warn` split onto
// stderr with the same joining — the runner holds both streams byte-for-byte against Node.

const a: number = 1;
const b: string = 'two';
const c: boolean = true;
console.log(a, b, c);
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

// A console call is still `undefined` in value position, at any width. `void` is not
// itself printable in ts mode, so what is asserted is that the position compiles and holds
// undefined (the console_builtins.ts twin spells out why).
const r: void = console.log('v', 'w');
console.log(typeof r);

// Arguments evaluate left to right into rooted slots: `f` runs between the two reads.
function f(): number {
  console.log('in-f');
  return 10;
}
const arr: number[] = [1, 2, 3];
console.log(arr[0], f(), arr[2]);
