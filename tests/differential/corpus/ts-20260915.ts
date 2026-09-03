const a: number = 9007199254740991;
let b: number = -2147483648;
b = Math.trunc(1);
const values: number[] = [Math.trunc(5e-324), (0 * 9007199254740991)];
let total: number = 0;
for (const value of values) { total += value; }
console.log(a);
console.log(b);
console.log(total);
console.log(values.length);
const text: string = "\ud800";
console.log(text.length);
console.log(text.charCodeAt(0));
const edge: number = NaN;
console.log(edge);
console.log(1 / edge);
