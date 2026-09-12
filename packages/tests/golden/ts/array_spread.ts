// Array-literal spread: typed arrays, a literal run between spreads, and a shallow copy.

const arr1: number[] = [1, 2];
const arr2: number[] = [3, 4];
const combined: number[] = [...arr1, ...arr2];
console.log(combined);

const mixed: number[] = [0, ...arr1, 9];
console.log(mixed);

const copy: number[] = [...arr1];
console.log(copy);
console.log(copy === arr1);
