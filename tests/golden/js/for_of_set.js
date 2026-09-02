const s = new Set();
s.add('a');
s.add('b');
s.add('a');
for (const e of s) {
  console.log(e);
}

const empty = new Set();
for (const e of empty) {
  console.log(e);
}

const live = new Set();
live.add('a');
live.add('b');
let n = 0;
for (const e of live) {
  console.log(e);
  n += 1;
  if (n === 1) {
    live.add('c');
    live.delete('b');
  }
}
