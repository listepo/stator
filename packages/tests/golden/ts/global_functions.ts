// The global conversions and number functions in ts mode (plan.md §11c T11.4): the typed
// spellings, the argument-less forms, typeof of the language's globals, Array.isArray over
// typed values, and the property name of an object binding pattern.

const texts: string[] = ['42', '  -0x1F', '0x', '', '12px', '1e3', '  3.5e2xyz', '-0', '.5', '5.', '1e+', '08', 'z'];
for (const t of texts) {
  console.log(JSON.stringify(t), Number(t), Boolean(t), parseInt(t), parseFloat(t), parseInt(t, 36));
}
const nums: number[] = [0, -0, 1.5, NaN, Infinity, -Infinity, 1e21, 2 ** 53];
for (const n of nums) {
  console.log(String(n), Boolean(n), isNaN(n), isFinite(n), parseInt(String(n)));
}
console.log(String(true), Number(false), String([1, [2, 3]]), String({ a: 1 }));
console.log(parseInt('ff', 16), parseInt('777', 8), parseInt('11', 2), parseInt('10', 1), parseInt('10', 37));
console.log(parseInt('fffffffffffffffffff', 16), parseInt('zzzzzzzzzzzzzzzzzzzz', 36));
console.log(JSON.stringify(String()), Number(), Boolean());
console.log(typeof JSON, typeof Math, typeof String, typeof parseFloat, typeof globalThis);
const xs: number[] = [1, 2, 3];
const word: string = 'hello';
console.log(Array.isArray(xs), Array.isArray(word), Array.isArray([]));
const { length: count } = xs;
const { length: chars } = word;
console.log(count, chars);
