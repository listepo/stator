// A `do { ... } while (false)` whose body JUMPS (plan-notes 218). The dead-code pass rewrites a
// false-tested do/while to its bare body, which is sound only while no `break`/`continue` inside
// names the loop being deleted: those name their target by position, so removing the loop
// retargets them at the next enclosing one -- or at nothing, which was an internal error. Both
// halves are below: the loop that must now survive, and the one that may still be flattened.

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

// A nested loop's own `break` belongs to the nested loop, so the rewrite is declined there too --
// conservatively, and the answers are the same either way.
let seen = '';
for (const x of [1, 2]) {
  do {
    for (const y of ['a', 'b']) {
      if (y === 'a') break;
      seen += `${x}${y}`;
    }
  } while (false);
}
console.log(`seen:${seen}`);

// A do/while with no jump in its body still folds to the body alone.
let plain = 0;
do {
  plain += 1;
} while (false);
console.log(plain);
