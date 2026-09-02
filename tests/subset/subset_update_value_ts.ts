// @mode: ts
// @verdict: static
// SUBSET.md: Prefix/postfix increment and compound assignment

let x: number = 0;
const y: number = x++;
const z: number = (x += 1);
console.log(y);
console.log(z);
