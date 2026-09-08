// @mode: ts
// @verdict: static
// SUBSET.md: while, do/while loops

let sum: number = 0;
let i: number = 0;
while (i < 5) {
  sum += i;
  i++;
}
let j: number = 0;
do {
  j++;
} while (j < 3);
console.log(sum);
console.log(j);
