// Array-literal spread in js mode: untyped arrays route through the dynamic representation.

const arr1 = [1, 2];
const arr2 = [3, 4];
const combined = [...arr1, ...arr2];
console.log(combined);

const mixed = [0, ...arr1, 9];
console.log(mixed);
