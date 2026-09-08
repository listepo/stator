// @mode: js
// @verdict: static
// SUBSET.md: Prefix/postfix increment and compound assignment

let x = 0;
const y = x++;
const z = (x += 1);
console.log(y);
console.log(z);
