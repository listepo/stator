// @mode: js
// @verdict: static
// SUBSET.md: while, do/while loops

let sum = 0;
let i = 0;
while (i < 5) {
  sum += i;
  i++;
}
let j = 0;
do {
  j++;
} while (j < 3);
console.log(sum);
console.log(j);
