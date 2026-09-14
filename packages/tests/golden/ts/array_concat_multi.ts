// Array concat with several arrays and with none (plan.md §8 step 19): each array
// argument spreads, neither the receiver nor any argument is mutated, and zero arguments
// answer a shallow copy that the receiver never sees change.

const a: number[] = [1];
const b: number[] = [2];
const c: number[] = [3];
console.log(a.concat(b, c));
console.log(a);
console.log(a.concat());
const d: number[] = a.concat();
d.push(9);
console.log(d);
console.log(a);
