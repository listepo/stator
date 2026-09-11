// The ts-mode twin of `js/do_while_abrupt.js` (plan-notes 218): a false-tested `do`/`while` whose
// body jumps must keep its loop, because `break`/`continue` name their target by position.

for (let j = 0; j < 2; j++) {
  do {
    continue;
  } while (false);
  console.log(`after ${j}`);
}

let i = 0;
do {
  i++;
  if (i < 5) break;
  i += 100;
} while (false);
console.log(i);

let k = 0;
outer: do {
  k++;
  if (k < 3) continue outer;
  k += 10;
} while (false);
console.log(k);

let plain = 0;
do {
  plain += 1;
} while (false);
console.log(plain);
